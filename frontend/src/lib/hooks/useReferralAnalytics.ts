"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, usePublicClient, useReadContract } from "wagmi";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { abis, getDeployment } from "@/lib/contracts";
import {
  fetchReferralLeaderboard,
  type ReferralLeaderboardRow,
} from "@/lib/referral/indexEvents";

export function useReferralStats() {
  const { address } = useConnection();
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);

  const { data: referralCount } = useReadContract({
    address: deployment?.referralRegistry,
    abi: abis.referral,
    functionName: "referralCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!deployment?.referralRegistry, refetchInterval: 15_000 },
  });

  const { data: hasCode } = useReadContract({
    address: deployment?.referralRegistry,
    abi: abis.referral,
    functionName: "referrerCode",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!deployment?.referralRegistry },
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
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);
  const publicClient = usePublicClient({ chainId });

  return useQuery<ReferralLeaderboardRow[]>({
    queryKey: ["referral-leaderboard", chainId, deployment?.referralRegistry, limit],
    queryFn: async () => {
      if (!publicClient || !deployment?.referralRegistry) return [];
      try {
        return await fetchReferralLeaderboard(
          publicClient,
          deployment.referralRegistry,
          chainId,
          limit
        );
      } catch {
        return [];
      }
    },
    enabled: !!publicClient && !!deployment?.referralRegistry,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
}
