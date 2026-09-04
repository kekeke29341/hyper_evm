import { NextRequest, NextResponse } from "next/server";
import { PROJECT_X_POOL } from "@/lib/constants";
import { getPoolByKey } from "@/lib/contracts";

export const revalidate = 600; // refresh from GeckoTerminal every 10 minutes

const FEE_RATE = 0.003; // Project X 0.3% pool
const USER_SHARE = PROJECT_X_POOL.userShareBps / 10_000; // 60% cashdrop share
const MAINNET = 999;

export type PoolAprResponse = {
  /** Gross LP fee APR of the Project X pool (percent) */
  poolAprPercent: number;
  /** User net APR after the 7/60/33 harvest split (percent) */
  netAprPercent: number;
  tvlUsd: number;
  volume24hUsd: number;
  source: "geckoterminal" | "fallback";
  fetchedAt: string;
  poolAddress?: string;
  poolKey?: string | null;
};

function geckoUrl(poolAddress: string): string {
  return `https://api.geckoterminal.com/api/v2/networks/hyperevm/pools/${poolAddress}`;
}

function fallback(poolAddress: string, poolKey: string | null): PoolAprResponse {
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
  };
}

function resolvePool(req: NextRequest): { address: string; key: string | null } {
  const p = req.nextUrl.searchParams;
  const poolKey = p.get("poolKey");
  if (poolKey) {
    const pool = getPoolByKey(MAINNET, poolKey);
    if (pool?.pool) return { address: pool.pool, key: poolKey };
  }
  const address = p.get("pool");
  if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { address, key: poolKey };
  }
  // Default: legacy HYPE/USDC (unchanged behaviour for existing callers)
  return { address: PROJECT_X_POOL.poolAddress, key: null };
}

export async function GET(req: NextRequest) {
  const { address: poolAddress, key: poolKey } = resolvePool(req);

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
    const body: PoolAprResponse = {
      poolAprPercent: Math.round(poolApr * 10) / 10,
      netAprPercent: Math.round(poolApr * USER_SHARE * 10) / 10,
      tvlUsd: Math.round(tvl),
      volume24hUsd: Math.round(volume24h),
      source: "geckoterminal",
      fetchedAt: new Date().toISOString(),
      poolAddress,
      poolKey,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(fallback(poolAddress, poolKey), {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  }
}
