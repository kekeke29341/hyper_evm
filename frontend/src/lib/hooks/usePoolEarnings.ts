"use client";

import { useMemo } from "react";
import { useConnection } from "wagmi";
import { formatUnits } from "viem";
import { useI18n } from "@/lib/i18n";
import { usePoolContext } from "@/lib/pools/PoolContext";
import { usePoolStats, usePoolVaultBalance } from "@/lib/hooks/usePoolVault";
import { usePoolApr } from "@/lib/hooks/usePoolApr";
import { formatQuoteAmount, poolPayoutClaims } from "@/lib/pools/earnings";
import {
  buildEarningsChartData,
  computeEarningsMetrics,
  type EarningsChartMode,
} from "@/lib/earnings/history";
import { displayQuoteSymbol } from "@/lib/pools/format";

/**
 * Pool-scoped earnings dashboard. Accruing estimate is the user's pro-rata share of
 * on-chain pendingUserRewards (exact at last refetch) — no USDC-hardcoded estimate API.
 */
export function usePoolEarnings(chartMode: EarningsChartMode = "cumulative") {
  const { locale } = useI18n();
  const { pool } = usePoolContext();
  const { address } = useConnection();
  const stats = usePoolStats();
  const balance = usePoolVaultBalance();
  const apr = usePoolApr(pool.key);
  const quoteSym = displayQuoteSymbol(pool);
  const localeTag = locale === "ja" ? "ja" : "en";

  const claims = useMemo(() => poolPayoutClaims(pool, address), [pool, address]);

  const metrics = useMemo(
    () =>
      computeEarningsMetrics(
        claims,
        balance.valueQuote,
        balance.hasPosition ? Date.now() - 7 * 86400_000 : null,
        apr.netAprPercent
      ),
    [claims, balance.valueQuote, balance.hasPosition, apr.netAprPercent]
  );

  const chartData = useMemo(
    () => buildEarningsChartData(claims, chartMode, localeTag),
    [claims, chartMode, localeTag]
  );

  const pendingShare =
    balance.hasPosition && stats.totalSupplyFloat > 0 && stats.pendingRewardsRaw
      ? (Number(formatUnits(stats.pendingRewardsRaw, pool.quoteDecimals)) *
          parseFloat(balance.shares)) /
        stats.totalSupplyFloat
      : 0;

  const totalEarned = claims.reduce((s, c) => s + c.usdc, 0);
  const lastClaim = claims.length > 0 ? claims[claims.length - 1] : null;

  return {
    quoteSym,
    claims,
    metrics,
    chartData,
    pendingShare,
    pendingShareFormatted: formatQuoteAmount(pendingShare),
    totalEarned,
    totalEarnedFormatted: formatQuoteAmount(totalEarned),
    lastClaim,
    lastClaimFormatted: lastClaim ? formatQuoteAmount(lastClaim.usdc) : null,
    positionValue: balance.valueQuote,
    positionValueFormatted: formatQuoteAmount(balance.valueQuote, 4),
    hasPosition: balance.hasPosition,
    apr,
  };
}
