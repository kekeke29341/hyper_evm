"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import {
  buildLiveCashdropEstimate,
  formatAccruingRate,
  formatUsdc6,
  impliedNetAprPercent,
  projectedDailyUsdc,
  type CashdropEstimateSnapshot,
} from "@/lib/earnings/cashdropEstimate";
import type { ReferrerLookup } from "@/lib/referral/allocation";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useVaultBalance } from "@/lib/hooks/useDeFi";

async function fetchEstimate(chainId: number, address: string): Promise<CashdropEstimateSnapshot> {
  const res = await fetch(
    `/api/cashdrop/estimate?chainId=${chainId}&address=${encodeURIComponent(address)}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Estimate failed (${res.status})`);
  }
  return res.json() as Promise<CashdropEstimateSnapshot>;
}

export function useAccruingRewards() {
  const { address } = useConnection();
  const chainId = useEffectiveChainId();
  const vaultBalance = useVaultBalance();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { data: snapshot, isLoading, isError, error } = useQuery({
    queryKey: ["cashdrop-estimate", chainId, address],
    queryFn: () => fetchEstimate(chainId, address!),
    enabled: !!address && vaultBalance.hasVaultPosition,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const referrers = useMemo((): ReferrerLookup | undefined => {
    if (!snapshot?.referrer) return undefined;
    return new Map([[snapshot.userAddress.toLowerCase(), snapshot.referrer]]);
  }, [snapshot]);

  const live = useMemo(() => {
    if (!snapshot) return null;
    return buildLiveCashdropEstimate(snapshot, nowMs, referrers);
  }, [snapshot, nowMs, referrers]);

  const amountFormatted = live ? formatUsdc6(live.amountUsdc6) : "0.000000";
  const isAccruing = (live?.ratePerSecondUsdc6 ?? 0) > 0 || (live?.amountUsdc6 ?? 0n) > 0n;
  const hasUnclaimed = vaultBalance.hasVaultPosition && (isAccruing || !!snapshot);
  const positionValueUsd = vaultBalance.hasVaultPosition ? vaultBalance.valueUsd : 0;
  const impliedNetApr = live
    ? impliedNetAprPercent(live.ratePerSecondUsdc6, positionValueUsd)
    : null;
  const projectedDailyUsdcAmount = live ? projectedDailyUsdc(live.ratePerSecondUsdc6) : 0;

  return {
    hasPosition: vaultBalance.hasVaultPosition,
    hasUnclaimed,
    isAccruing,
    isLoading,
    isError,
    error: error instanceof Error ? error.message : null,
    usesExactEstimate: !!snapshot,
    amountUsdc: live ? Number(live.amountUsdc6) / 1e6 : 0,
    amountFormatted,
    projectedDailyUsdc: projectedDailyUsdcAmount,
    impliedNetAprPercent: impliedNetApr,
    positionValueUsd,
    ratePerSecond: live?.ratePerSecondUsdc6 ?? 0,
    ratePerMinute: live?.ratePerMinuteUsdc6 ?? 0,
    ratePerSecondFormatted: formatAccruingRate(live?.ratePerSecondUsdc6 ?? 0),
    ratePerMinuteFormatted: formatAccruingRate(live?.ratePerMinuteUsdc6 ?? 0),
    snapshot,
  };
}
