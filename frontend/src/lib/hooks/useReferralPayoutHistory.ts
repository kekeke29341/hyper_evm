"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useConnection, usePublicClient } from "wagmi";
import {
  fetchOnChainEarningsClaims,
  ON_CHAIN_EARNINGS_CHAIN_IDS,
} from "@/lib/earnings/onChain";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useDeployment, useVaultBalance } from "@/lib/hooks/useDeFi";
import { useReferralStats } from "@/lib/hooks/useReferralAnalytics";
import { computeCommissionFromReferee } from "@/lib/referral/commissionAttribution";
import {
  appendReferralPayoutRecord,
  loadReferralPayoutHistory,
  referralPayoutStorageKey,
  type ReferralPayoutRecord,
} from "@/lib/referral/commissionHistory";
import { computeReferrerCommission } from "@/lib/referral/earnings";
import { fetchReferrerMap } from "@/lib/referral/registry";

export function useReferralPayoutHistory() {
  const { address } = useConnection();
  const chainId = useEffectiveChainId();
  const deployment = useDeployment();
  const publicClient = usePublicClient({ chainId });
  const vaultBalance = useVaultBalance();
  const { referralCount, hasRefereeBoost, boundReferrer } = useReferralStats();

  const referrerKey =
    address && referralCount > 0
      ? referralPayoutStorageKey(chainId, address, "referrer")
      : null;
  const fromRefereeKey =
    address && hasRefereeBoost
      ? referralPayoutStorageKey(chainId, address, "from-referee")
      : null;

  const [localReferrerRows, setLocalReferrerRows] = useState<ReferralPayoutRecord[]>([]);
  const [localFromRefereeRows, setLocalFromRefereeRows] = useState<ReferralPayoutRecord[]>([]);

  const refreshLocal = useCallback(() => {
    setLocalReferrerRows(referrerKey ? loadReferralPayoutHistory(referrerKey) : []);
    setLocalFromRefereeRows(fromRefereeKey ? loadReferralPayoutHistory(fromRefereeKey) : []);
  }, [referrerKey, fromRefereeKey]);

  useEffect(() => {
    refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    const onUpdated = () => refreshLocal();
    window.addEventListener("hyperpool:referral-payout-updated", onUpdated);
    return () => window.removeEventListener("hyperpool:referral-payout-updated", onUpdated);
  }, [refreshLocal]);

  const onChainEnabled =
    !!publicClient &&
    !!deployment?.airdrop &&
    !!address &&
    ON_CHAIN_EARNINGS_CHAIN_IDS.has(chainId);

  const { data: myOnChainClaims = [], isFetching: onChainLoading } = useQuery({
    queryKey: ["referral-payout-onchain", chainId, address, deployment?.airdrop],
    queryFn: async () => {
      if (!publicClient || !deployment?.airdrop || !address) return [];
      return fetchOnChainEarningsClaims(publicClient, deployment.airdrop, address, chainId);
    },
    enabled: onChainEnabled && (referralCount > 0 || hasRefereeBoost),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const { data: referrers } = useQuery({
    queryKey: [
      "referral-map-history",
      chainId,
      deployment?.referralRegistry,
      deployment?.vaultShareHolders?.length,
    ],
    queryFn: async () => {
      if (!publicClient || !deployment?.referralRegistry || !deployment.vaultShareHolders?.length) {
        return new Map();
      }
      return fetchReferrerMap(
        publicClient,
        deployment.referralRegistry,
        deployment.vaultShareHolders.map((h) => ({ address: h.address }))
      );
    },
    enabled: !!publicClient && !!deployment?.referralRegistry && !!deployment.vaultShareHolders?.length,
    staleTime: 30_000,
  });

  // Snapshot latest distribution commission into localStorage for attribution.
  useEffect(() => {
    const dist = deployment?.lastCashdropDistribution;
    if (!dist?.txHash || !address || !referrers) return;

    const executedAt = new Date(dist.executedAt).getTime();
    if (!Number.isFinite(executedAt)) return;

    if (referralCount > 0 && referrerKey) {
      const commission = computeReferrerCommission({ address, deployment: deployment!, referrers });
      if (commission > 0n) {
        appendReferralPayoutRecord(referrerKey, {
          t: executedAt,
          usdc: parseFloat(formatUnits(commission, 6)),
          txHash: dist.txHash,
          kind: "referrer",
        });
      }
    }

    if (hasRefereeBoost && boundReferrer && fromRefereeKey) {
      const fromMe = computeCommissionFromReferee({
        referee: address,
        referrer: boundReferrer,
        deployment: deployment!,
        referrers,
      });
      if (fromMe > 0n) {
        appendReferralPayoutRecord(fromRefereeKey, {
          t: executedAt,
          usdc: parseFloat(formatUnits(fromMe, 6)),
          txHash: dist.txHash,
          kind: "from-referee",
        });
      }
    }

    refreshLocal();
  }, [
    deployment?.lastCashdropDistribution?.txHash,
    deployment?.lastCashdropDistribution?.executedAt,
    address,
    referrers,
    referralCount,
    hasRefereeBoost,
    boundReferrer,
    referrerKey,
    fromRefereeKey,
    deployment,
    refreshLocal,
  ]);

  const referrerHistory = useMemo(() => {
    if (referralCount === 0 || !address || !deployment) return [];

    const byTx = new Map<string, ReferralPayoutRecord>();

    for (const local of localReferrerRows) {
      if (local.txHash) byTx.set(local.txHash, local);
    }

    const dist = deployment.lastCashdropDistribution;
    if (dist?.txHash && referrers) {
      const commission = computeReferrerCommission({ address, deployment, referrers });
      if (commission > 0n && !byTx.has(dist.txHash)) {
        byTx.set(dist.txHash, {
          t: new Date(dist.executedAt).getTime(),
          usdc: parseFloat(formatUnits(commission, 6)),
          txHash: dist.txHash,
          kind: "referrer",
        });
      }
    }

    for (const claim of myOnChainClaims) {
      if (!claim.txHash || byTx.has(claim.txHash)) continue;
      if (!vaultBalance.hasVaultPosition) {
        byTx.set(claim.txHash, {
          t: claim.t,
          usdc: claim.usdc,
          txHash: claim.txHash,
          kind: "referrer",
        });
      }
    }

    return [...byTx.values()].sort((a, b) => b.t - a.t);
  }, [
    referralCount,
    address,
    deployment,
    localReferrerRows,
    referrers,
    myOnChainClaims,
    vaultBalance.hasVaultPosition,
  ]);

  const referrerContributionHistory = useMemo(() => {
    if (!hasRefereeBoost || !boundReferrer) return [];

    const rows: ReferralPayoutRecord[] = [...localFromRefereeRows];
    const dist = deployment?.lastCashdropDistribution;

    if (dist?.txHash && referrers && address && !rows.some((r) => r.txHash === dist.txHash)) {
      const fromMe = computeCommissionFromReferee({
        referee: address,
        referrer: boundReferrer,
        deployment: deployment!,
        referrers,
      });
      if (fromMe > 0n) {
        rows.push({
          t: new Date(dist.executedAt).getTime(),
          usdc: parseFloat(formatUnits(fromMe, 6)),
          txHash: dist.txHash,
          kind: "from-referee",
        });
      }
    }

    const seen = new Set<string>();
    return rows
      .filter((r) => {
        const key = r.txHash ?? String(r.t);
        if (seen.has(key)) return false;
        seen.add(key);
        return r.usdc > 0;
      })
      .sort((a, b) => b.t - a.t);
  }, [hasRefereeBoost, boundReferrer, localFromRefereeRows, deployment, referrers, address]);

  return {
    boundReferrer,
    referrerHistory,
    referrerContributionHistory,
    onChainLoading,
    hasReferrerHistory: referralCount > 0,
    hasContributionHistory: hasRefereeBoost && !!boundReferrer,
  };
}
