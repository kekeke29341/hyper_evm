import { NextResponse } from "next/server";
import { PROJECT_X_POOL } from "@/lib/constants";

export const revalidate = 600; // refresh from GeckoTerminal every 10 minutes

const GECKO_POOL_URL = `https://api.geckoterminal.com/api/v2/networks/hyperevm/pools/${PROJECT_X_POOL.poolAddress}`;
const FEE_RATE = 0.003; // Project X 0.3% pool
const USER_SHARE = PROJECT_X_POOL.userShareBps / 10_000;

export type PoolAprResponse = {
  /** Gross LP fee APR of the Project X pool (percent) */
  poolAprPercent: number;
  /** User net APR after the 7/60/33 harvest split (percent) */
  netAprPercent: number;
  tvlUsd: number;
  volume24hUsd: number;
  source: "geckoterminal" | "fallback";
  fetchedAt: string;
};

function fallback(): PoolAprResponse {
  return {
    poolAprPercent: PROJECT_X_POOL.referenceAprNum,
    netAprPercent: Math.round(PROJECT_X_POOL.referenceAprNum * USER_SHARE * 10) / 10,
    tvlUsd: 0,
    volume24hUsd: 0,
    source: "fallback",
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const res = await fetch(GECKO_POOL_URL, {
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
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(fallback(), {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  }
}
