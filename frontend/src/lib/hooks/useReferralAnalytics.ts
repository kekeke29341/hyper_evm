"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, usePublicClient, useReadContract } from "wagmi";
import { abis, getDeployment } from "@/lib/contracts";
import { defaultChain } from "@/lib/wagmi/config";
import {
  fetchReferralLeaderboard,
  type ReferralLeaderboardRow,
} from "@/lib/referral/indexEvents";

export function useReferralStats() {
  const { address } = useConnection();
  const chainId = defaultChain.id;
  const deployment = getDeployment(chainId);

  const registry = deployment?.referralRegistry;
  const readsEnabled = !!address && !!registry;

  const { data: referralCount } = useReadContract({
    chainId,
    address: registry,
    abi: abis.referral,
    functionName: "referralCount",
    args: address ? [address] : undefined,
    query: { enabled: readsEnabled, refetchInterval: 15_000 },
  });

  const { data: isRegistered } = useReadContract({
    chainId,
    address: registry,
    abi: abis.referral,
    functionName: "isRegisteredReferrer",
    args: address ? [address] : undefined,
    query: { enabled: readsEnabled },
  });

  const { data: boundReferrer } = useReadContract({
    chainId,
    address: registry,
    abi: abis.referral,
    functionName: "getReferrer",
    args: address ? [address] : undefined,
    query: { enabled: readsEnabled },
  });

  const zeroAddr = "0x0000000000000000000000000000000000000000";

  const registered = isRegistered === true;

  const hasRefereeBoost =
    boundReferrer !== undefined &&
    (boundReferrer as string).toLowerCase() !== zeroAddr;

  const boundReferrerAddress =
    boundReferrer !== undefined &&
    (boundReferrer as string).toLowerCase() !== zeroAddr
      ? (boundReferrer as `0x${string}`)
      : null;

  return {
    referralCount: referralCount !== undefined ? Number(referralCount) : 0,
    registered,
    hasRefereeBoost,
    boundReferrer: boundReferrerAddress,
    hasDeployment: !!deployment,
    hasReferralRegistry: !!registry,
  };
}

export function useReferralLeaderboard(limit = 5) {
  const chainId = defaultChain.id;
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
