"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, useChainId, usePublicClient, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { abis, getDeployment } from "@/lib/contracts";
import {
  appendPointsSnapshot,
  historyStorageKey,
  loadPointsHistory,
  snapshotsToChartData,
  type ChartPoint,
} from "@/lib/points/history";
import {
  fetchPointsLeaderboard,
  fetchReferralLeaderboard,
  type ReferralLeaderboardRow,
} from "@/lib/points/indexEvents";
import {
  findUserRank,
  formatMultiplier,
  rankToMultiplier,
  type LeaderboardRow,
} from "@/lib/points/multiplier";
import { useI18n } from "@/lib/i18n";

export function usePointsLeaderboard(limit = 5) {
  const chainId = useChainId();
  const deployment = getDeployment(chainId);
  const publicClient = usePublicClient();

  const { data: epochStart } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "epochStart",
    query: { enabled: !!deployment },
  });

  return useQuery({
    queryKey: ["points-leaderboard", chainId, deployment?.pointsDistributor, epochStart, limit],
    queryFn: async () => {
      if (!publicClient || !deployment || epochStart === undefined) return [];
      return fetchPointsLeaderboard(
        publicClient,
        deployment.pointsDistributor,
        chainId,
        Number(epochStart),
        limit
      );
    },
    enabled: !!publicClient && !!deployment && epochStart !== undefined,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function usePointsHistoryChart(currentPoints: number | null) {
  const { address } = useConnection();
  const chainId = useChainId();
  const { locale } = useI18n();
  const [chart, setChart] = useState<ChartPoint[]>([]);

  const storageKey = useMemo(
    () => (address ? historyStorageKey(chainId, address) : null),
    [address, chainId]
  );

  useEffect(() => {
    if (!storageKey || currentPoints === null) return;
    const snapshots = appendPointsSnapshot(storageKey, currentPoints);
    setChart(snapshotsToChartData(snapshots, locale));
  }, [storageKey, currentPoints, locale]);

  useEffect(() => {
    if (!storageKey) {
      setChart([]);
      return;
    }
    const existing = loadPointsHistory(storageKey);
    if (existing.length > 0) {
      setChart(snapshotsToChartData(existing, locale));
    }
  }, [storageKey, locale]);

  return { chart, hasHistory: chart.some((d) => d.pts > 0) };
}

export function useUserPointsRank(rows: LeaderboardRow[] | undefined) {
  const { address } = useConnection();
  const rank = findUserRank(rows ?? [], address);
  const multiplier = rankToMultiplier(rank);
  return {
    rank,
    multiplier,
    multiplierLabel: formatMultiplier(rank),
    inTop100: rank !== null && rank <= 100,
  };
}

export function useEpochFeeContribution() {
  const { address } = useConnection();
  const chainId = useChainId();
  const deployment = getDeployment(chainId);

  const { data: currentEpoch } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "currentEpoch",
    query: { enabled: !!deployment },
  });

  const { data } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "epochFeeContribution",
    args:
      address !== undefined && currentEpoch !== undefined
        ? [currentEpoch as bigint, address]
        : undefined,
    query: {
      enabled: !!address && !!deployment && currentEpoch !== undefined,
      refetchInterval: 10_000,
    },
  });

  const contribution =
    data !== undefined ? Number(formatUnits(data as bigint, 18)) : null;

  return { contribution, hasDeployment: !!deployment };
}

export function useReferralStats() {
  const { address } = useConnection();
  const chainId = useChainId();
  const deployment = getDeployment(chainId);

  const { data: referralCount } = useReadContract({
    address: deployment?.referralRegistry,
    abi: abis.referral,
    functionName: "referralCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!deployment, refetchInterval: 15_000 },
  });

  const { data: hasCode } = useReadContract({
    address: deployment?.referralRegistry,
    abi: abis.referral,
    functionName: "referrerCode",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!deployment },
  });

  const registered =
    hasCode !== undefined &&
    (hasCode as string) !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  return {
    referralCount: referralCount !== undefined ? Number(referralCount) : 0,
    registered,
    hasDeployment: !!deployment,
  };
}

export function useReferralLeaderboard(limit = 5) {
  const chainId = useChainId();
  const deployment = getDeployment(chainId);
  const publicClient = usePublicClient();

  return useQuery<ReferralLeaderboardRow[]>({
    queryKey: ["referral-leaderboard", chainId, deployment?.referralRegistry, limit],
    queryFn: async () => {
      if (!publicClient || !deployment) return [];
      return fetchReferralLeaderboard(
        publicClient,
        deployment.referralRegistry,
        chainId,
        limit
      );
    },
    enabled: !!publicClient && !!deployment,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
