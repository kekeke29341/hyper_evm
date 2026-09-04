"use client";

import { useQuery } from "@tanstack/react-query";
import { PROJECT_X_POOL } from "@/lib/constants";
import type { PoolAprResponse } from "@/app/api/pool-apr/route";

const LEGACY_FALLBACK: PoolAprResponse = {
  poolAprPercent: PROJECT_X_POOL.referenceAprNum,
  netAprPercent:
    Math.round(((PROJECT_X_POOL.referenceAprNum * PROJECT_X_POOL.userShareBps) / 10_000) * 10) / 10,
  tvlUsd: 0,
  volume24hUsd: 0,
  source: "fallback",
  fetchedAt: "",
  poolKey: null,
};

async function fetchPoolApr(poolKey?: string): Promise<PoolAprResponse> {
  const qs = poolKey ? `?poolKey=${encodeURIComponent(poolKey)}` : "";
  const res = await fetch(`/api/pool-apr${qs}`);
  if (!res.ok) throw new Error(`pool-apr failed (${res.status})`);
  return res.json() as Promise<PoolAprResponse>;
}

function formatUsdCompact(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Live Project X pool APR (GeckoTerminal, ~10 min cache).
 * - No arg / undefined → legacy HYPE/USDC (existing callers unchanged)
 * - poolKey → HYPE-quoted pools[] entry
 */
export function usePoolApr(poolKey?: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["pool-apr", poolKey ?? "legacy"],
    queryFn: () => fetchPoolApr(poolKey),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });

  const apr = data ?? (poolKey ? { ...LEGACY_FALLBACK, poolAprPercent: 0, netAprPercent: 0, poolKey } : LEGACY_FALLBACK);
  const isLive = apr.source === "geckoterminal";
  const hasApr = isLive && apr.poolAprPercent > 0;

  return {
    isLoading,
    isLive,
    poolAprPercent: apr.poolAprPercent,
    netAprPercent: apr.netAprPercent,
    tvlUsd: apr.tvlUsd,
    volume24hUsd: apr.volume24hUsd,
    poolAprLabel: hasApr || (!poolKey && apr.poolAprPercent > 0) ? `${apr.poolAprPercent.toFixed(1)}%` : "—",
    netAprLabel: hasApr || (!poolKey && apr.netAprPercent > 0) ? `${apr.netAprPercent.toFixed(1)}%` : "—",
    poolTvlLabel: isLive
      ? formatUsdCompact(apr.tvlUsd)
      : poolKey
        ? "—"
        : PROJECT_X_POOL.tvl,
    volume24hLabel: isLive
      ? formatUsdCompact(apr.volume24hUsd)
      : poolKey
        ? "—"
        : PROJECT_X_POOL.volume24h,
  };
}
