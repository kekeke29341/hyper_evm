import { NextRequest, NextResponse } from "next/server";
import { PROJECT_X_POOL } from "@/lib/constants";
import { getPoolByKey, type PoolDeployment } from "@/lib/contracts";

export const revalidate = 600; // refresh from GeckoTerminal every 10 minutes

const FEE_RATE = 0.003; // Project X 0.3% pool
const USER_SHARE = PROJECT_X_POOL.userShareBps / 10_000; // 60% cashdrop share
const MAINNET = 999;
const MAINNET_RPC = "https://rpc.hyperliquid.xyz/evm";

export type PoolAprResponse = {
  /** Gross LP fee APR of the Project X pool (percent) */
  poolAprPercent: number;
  /** User net APR after the 7/60/33 harvest split (percent) — 0 while the vault is out of range */
  netAprPercent: number;
  tvlUsd: number;
  volume24hUsd: number;
  source: "geckoterminal" | "fallback";
  fetchedAt: string;
  poolAddress?: string;
  poolKey?: string | null;
  /**
   * Whether the vault's own LP position currently straddles the pool price.
   * A concentrated position that has drifted outside its range earns NO fees, so the
   * pool-wide APR above is not what depositors are earning. `null` = unknown (read failed,
   * or legacy vault where this check does not apply).
   */
  vaultInRange?: boolean | null;
};

function geckoUrl(poolAddress: string): string {
  return `https://api.geckoterminal.com/api/v2/networks/hyperevm/pools/${poolAddress}`;
}

function fallback(
  poolAddress: string,
  poolKey: string | null,
  vaultInRange: boolean | null
): PoolAprResponse {
  // Legacy HYPE/USDC keeps the static snapshot; HYPE-quoted pools have no static APR —
  // return zeros so the UI shows "—" rather than the wrong USDC-pool number.
  const isLegacy = !poolKey;
  return {
    poolAprPercent: isLegacy ? PROJECT_X_POOL.referenceAprNum : 0,
    netAprPercent: isLegacy
      ? Math.round(PROJECT_X_POOL.referenceAprNum * USER_SHARE * 10) / 10
      : 0,
    tvlUsd: 0,
    volume24hUsd: 0,
    source: "fallback",
    fetchedAt: new Date().toISOString(),
    poolAddress,
    poolKey,
    vaultInRange,
  };
}

function resolvePool(req: NextRequest): {
  address: string;
  key: string | null;
  pool: PoolDeployment | null;
} {
  const p = req.nextUrl.searchParams;
  const poolKey = p.get("poolKey");
  if (poolKey) {
    const pool = getPoolByKey(MAINNET, poolKey);
    if (pool?.pool) return { address: pool.pool, key: poolKey, pool };
  }
  const address = p.get("pool");
  if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { address, key: poolKey, pool: null };
  }
  // Default: legacy HYPE/USDC (unchanged behaviour for existing callers)
  return { address: PROJECT_X_POOL.poolAddress, key: null, pool: null };
}

const slot0Abi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

const tickAbi = [
  { type: "function", name: "tickLower", stateMutability: "view", inputs: [], outputs: [{ type: "int24" }] },
  { type: "function", name: "tickUpper", stateMutability: "view", inputs: [], outputs: [{ type: "int24" }] },
] as const;

/**
 * True when the vault's minted range contains the live pool tick.
 *
 * The keeper re-centres the position on every run; if it stops (or `rebalance` reverts, which
 * it does once the position has drifted 100% to one side) the LP sits outside its range and
 * accrues nothing, while GeckoTerminal still reports a healthy pool-wide APR. Surfacing this
 * is the difference between "you are earning 15%" and "you are earning 0%".
 */
async function readVaultInRange(pool: PoolDeployment | null): Promise<boolean | null> {
  if (!pool?.pool || !pool.adapter) return null;
  try {
    const { createPublicClient, http } = await import("viem");
    const client = createPublicClient({ transport: http(MAINNET_RPC) });
    const [slot0, tickLower, tickUpper] = await Promise.all([
      client.readContract({ address: pool.pool, abi: slot0Abi, functionName: "slot0" }),
      client.readContract({ address: pool.adapter, abi: tickAbi, functionName: "tickLower" }),
      client.readContract({ address: pool.adapter, abi: tickAbi, functionName: "tickUpper" }),
    ]);
    const tick = Number(slot0[1]);
    const lower = Number(tickLower);
    const upper = Number(tickUpper);
    if (lower >= upper) return null; // no position minted yet
    return tick >= lower && tick < upper;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { address: poolAddress, key: poolKey, pool } = resolvePool(req);
  const vaultInRange = await readVaultInRange(pool);

  try {
    const res = await fetch(geckoUrl(poolAddress), {
      headers: { accept: "application/json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`geckoterminal ${res.status}`);

    const json = (await res.json()) as {
      data?: { attributes?: { volume_usd?: { h24?: string }; reserve_in_usd?: string } };
    };
    const attrs = json.data?.attributes;
    const volume24h = Number(attrs?.volume_usd?.h24 ?? 0);
    const tvl = Number(attrs?.reserve_in_usd ?? 0);
    if (!Number.isFinite(volume24h) || !Number.isFinite(tvl) || tvl <= 0) {
      throw new Error("geckoterminal returned invalid pool metrics");
    }

    // Simple full-range fee APR: 24h volume × fee tier ÷ pool TVL, annualized.
    // Deliberately no concentration multiplier — better to under-promise.
    const poolApr = ((volume24h * FEE_RATE) / tvl) * 365 * 100;
    // An out-of-range position earns no fees, so the depositor's net APR is 0 no matter
    // what the pool is doing. Never advertise a yield the vault is not currently earning.
    const netApr = vaultInRange === false ? 0 : poolApr * USER_SHARE;
    const body: PoolAprResponse = {
      poolAprPercent: Math.round(poolApr * 10) / 10,
      netAprPercent: Math.round(netApr * 10) / 10,
      tvlUsd: Math.round(tvl),
      volume24hUsd: Math.round(volume24h),
      source: "geckoterminal",
      fetchedAt: new Date().toISOString(),
      poolAddress,
      poolKey,
      vaultInRange,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(fallback(poolAddress, poolKey, vaultInRange), {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  }
}
