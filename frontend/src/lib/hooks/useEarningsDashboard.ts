"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, usePublicClient } from "wagmi";
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
import {
  fetchOnChainEarningsClaims,
  ON_CHAIN_EARNINGS_CHAIN_IDS,
} from "@/lib/earnings/onChain";
import { useDeployment, useVaultBalance } from "@/lib/hooks/useDeFi";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useI18n } from "@/lib/i18n";

export function useEarningsDashboard() {
  const { address } = useConnection();
  const chainId = useEffectiveChainId();
  const { locale } = useI18n();
  const deployment = useDeployment();
  const vaultBalance = useVaultBalance();
  const publicClient = usePublicClient({ chainId });
  const queryClient = useQueryClient();

  const [localClaims, setLocalClaims] = useState<ReturnType<typeof loadEarningsHistory>>([]);
  const [positionStart, setPositionStart] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<EarningsChartMode>("cumulative");

  const earningsKey =
    chainId && address ? earningsStorageKey(chainId, address) : null;
  const startKey =
    chainId && address ? positionStartStorageKey(chainId, address) : null;
  const onChainEnabled =
    !!publicClient &&
    !!deployment?.airdrop &&
    !!address &&
    ON_CHAIN_EARNINGS_CHAIN_IDS.has(chainId);

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

  const { data: onChainClaims = [], isFetching: onChainLoading } = useQuery({
    queryKey: ["earnings-onchain", chainId, address, deployment?.airdrop],
    queryFn: async () => {
      if (!publicClient || !deployment?.airdrop || !address) return [];
      return fetchOnChainEarningsClaims(
        publicClient,
        deployment.airdrop,
        address,
        chainId
      );
    },
    enabled: onChainEnabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!earningsKey) return;
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (!detail?.key || detail.key === earningsKey) {
        refreshLocal();
        if (onChainEnabled) {
          void queryClient.invalidateQueries({ queryKey: ["earnings-onchain"] });
        }
      }
    };
    window.addEventListener("hyperpool:earnings-updated", onUpdated);
    return () => window.removeEventListener("hyperpool:earnings-updated", onUpdated);
  }, [earningsKey, refreshLocal, onChainEnabled, queryClient]);

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
    () =>
      onChainEnabled
        ? mergeEarningsClaims(onChainClaims, localClaims)
        : localClaims,
    [onChainEnabled, onChainClaims, localClaims]
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
    hasHistory: claims.length > 0,
    onChainSync: onChainEnabled,
    onChainLoading,
    refresh: refreshLocal,
    earningsKey,
  };
}
