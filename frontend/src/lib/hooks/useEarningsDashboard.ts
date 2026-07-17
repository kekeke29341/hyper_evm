"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { PROJECT_X_POOL } from "@/lib/constants";
import { getVaultAddress } from "@/lib/contracts";
import {
  buildEarningsChartData,
  computeEarningsMetrics,
  earningsStorageKey,
  loadEarningsHistory,
  loadPositionStart,
  mergeEarningsClaims,
  monthlyEarningsSummary,
  positionStartStorageKey,
  type EarningsChartMode,
} from "@/lib/earnings/history";
import { useCashdropPayoutClaims } from "@/lib/hooks/useCashdropPayoutClaims";
import { useDeployment, useVaultBalance } from "@/lib/hooks/useDeFi";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useI18n } from "@/lib/i18n";

export function useEarningsDashboard() {
  const { address } = useConnection();
  const chainId = useEffectiveChainId();
  const { locale } = useI18n();
  const deployment = useDeployment();
  const vaultBalance = useVaultBalance();
  const queryClient = useQueryClient();

  const [localClaims, setLocalClaims] = useState<ReturnType<typeof loadEarningsHistory>>([]);
  const [positionStart, setPositionStart] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<EarningsChartMode>("cumulative");

  const earningsKey =
    chainId && address ? earningsStorageKey(chainId, address) : null;
  const startKey =
    chainId && address ? positionStartStorageKey(chainId, address) : null;
  const {
    claims: payoutClaims,
    isLoading: payoutLoading,
    isFetching: payoutFetching,
    hasHistory: payoutHasHistory,
  } = useCashdropPayoutClaims();

  const refreshLocal = useCallback(() => {
    if (!earningsKey || !startKey) {
      setLocalClaims([]);
      setPositionStart(null);
      return;
    }
    setLocalClaims(loadEarningsHistory(earningsKey));
    setPositionStart(loadPositionStart(startKey));
  }, [earningsKey, startKey]);

  useEffect(() => {
    refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    if (!earningsKey) return;
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (!detail?.key || detail.key === earningsKey) {
        refreshLocal();
        void queryClient.invalidateQueries({ queryKey: ["cashdrop-payouts"] });
      }
    };
    window.addEventListener("hyperpool:earnings-updated", onUpdated);
    return () => window.removeEventListener("hyperpool:earnings-updated", onUpdated);
  }, [earningsKey, refreshLocal, queryClient]);

  useEffect(() => {
    if (vaultBalance.hasVaultPosition && startKey) {
      const start = loadPositionStart(startKey);
      if (start === null) {
        localStorage.setItem(startKey, String(Date.now()));
        refreshLocal();
      }
    }
  }, [vaultBalance.hasVaultPosition, startKey, refreshLocal]);

  const claims = useMemo(
    () => mergeEarningsClaims(payoutClaims, localClaims),
    [payoutClaims, localClaims]
  );

  const positionValueUsd = vaultBalance.hasVaultPosition ? vaultBalance.valueUsd : 0;
  const effectivePositionStart = positionStart;

  const metrics = useMemo(
    () =>
      computeEarningsMetrics(
        claims,
        positionValueUsd,
        effectivePositionStart,
        PROJECT_X_POOL.referenceAprNum
      ),
    [claims, positionValueUsd, effectivePositionStart]
  );

  const chartData = useMemo(
    () => buildEarningsChartData(claims, chartMode, locale),
    [claims, chartMode, locale]
  );

  const monthlyRows = useMemo(
    () => monthlyEarningsSummary(claims, locale),
    [claims, locale]
  );

  return {
    hasDeployment: !!deployment,
    hasPosition: vaultBalance.hasVaultPosition,
    positionValueUsd,
    vaultAddress: deployment ? getVaultAddress(deployment) : undefined,
    metrics,
    chartData,
    chartMode,
    setChartMode,
    monthlyRows,
    hasHistory: claims.length > 0 || payoutHasHistory,
    onChainSync: payoutHasHistory,
    onChainLoading: payoutLoading || payoutFetching,
    refresh: refreshLocal,
    earningsKey,
  };
}
