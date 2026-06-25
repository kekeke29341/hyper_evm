"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useConnection, usePublicClient } from "wagmi";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { getDeployment } from "@/lib/contracts";
import { useReferralStats } from "@/lib/hooks/useReferralAnalytics";
import { computeReferrerCommission } from "@/lib/referral/earnings";
import { fetchReferrerMap } from "@/lib/referral/registry";

export function useReferralEarnings() {
  const { address } = useConnection();
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);
  const publicClient = usePublicClient({ chainId });
  const { referralCount } = useReferralStats();

  const { data: referrers, isLoading } = useQuery({
    queryKey: [
      "referral-map",
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
    refetchInterval: 30_000,
  });

  const commissionRaw = useMemo(() => {
    if (!address || !deployment || !referrers || referralCount === 0) return 0n;
    return computeReferrerCommission({ address, deployment, referrers });
  }, [address, deployment, referrers, referralCount]);

  const commissionUsdc =
    commissionRaw > 0n ? formatUnits(commissionRaw, 6) : referralCount > 0 ? "0.00" : null;

  const hasCommissionThisRound = commissionRaw > 0n;

  return {
    isLoading,
    commissionUsdc,
    hasCommissionThisRound,
    claimableViaCashdrop: hasCommissionThisRound,
    alreadyClaimedThisRound: false,
  };
}
