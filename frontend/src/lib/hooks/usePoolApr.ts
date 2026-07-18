"use client";

import { useQuery } from "@tanstack/react-query";
import { PROJECT_X_POOL } from "@/lib/constants";
import type { PoolAprResponse } from "@/app/api/pool-apr/route";

const FALLBACK: PoolAprResponse = {
  poolAprPercent: PROJECT_X_POOL.referenceAprNum,
  netAprPercent:
    Math.round(((PROJECT_X_POOL.referenceAprNum * PROJECT_X_POOL.userShareBps) / 10_000) * 10) / 10,
  tvlUsd: 0,
  volume24hUsd: 0,
  source: "fallback",
  fetchedAt: "",
};

async function fetchPoolApr(): Promise<PoolAprResponse> {
  const res = await fetch("/api/pool-apr");
  if (!res.ok) throw new Error(`pool-apr failed (${res.status})`);
  return res.json() as Promise<PoolAprResponse>;
}

function formatUsdCompact(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/** Live Project X pool APR (GeckoTerminal, ~10 min cache) with static fallback. */
export function usePoolApr() {
  const { data, isLoading } = useQuery({
    queryKey: ["pool-apr"],
    queryFn: fetchPoolApr,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });

  const apr = data ?? FALLBACK;
  const isLive = apr.source === "geckoterminal";
  return {
    isLoading,
    isLive,
    poolAprPercent: apr.poolAprPercent,
    netAprPercent: apr.netAprPercent,
    tvlUsd: apr.tvlUsd,
    volume24hUsd: apr.volume24hUsd,
    poolAprLabel: `${apr.poolAprPercent.toFixed(1)}%`,
    netAprLabel: `${apr.netAprPercent.toFixed(1)}%`,
    poolTvlLabel: isLive ? formatUsdCompact(apr.tvlUsd) : PROJECT_X_POOL.tvl,
    volume24hLabel: isLive ? formatUsdCompact(apr.volume24hUsd) : PROJECT_X_POOL.volume24h,
  };
}
