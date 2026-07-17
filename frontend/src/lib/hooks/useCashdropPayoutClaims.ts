"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, usePublicClient } from "wagmi";
import { deploymentPayoutClaims } from "@/lib/earnings/deploymentPayouts";
import { mergeEarningsClaims, type EarningsClaim } from "@/lib/earnings/history";
import { fetchOnChainEarningsClaims, ON_CHAIN_EARNINGS_CHAIN_IDS } from "@/lib/earnings/onChain";
import { useDeployment } from "@/lib/hooks/useDeFi";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";

async function fetchPayoutClaimsFromApi(
  chainId: number,
  address: string
): Promise<EarningsClaim[]> {
  const res = await fetch(
    `/api/cashdrop/payouts?chainId=${chainId}&address=${encodeURIComponent(address)}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Payout history failed (${res.status})`);
  }
  return res.json() as Promise<EarningsClaim[]>;
}

/** Mainnet browser RPC is rate-limited — use server route for reliable payout history. */
function useServerPayoutApi(chainId: number): boolean {
  return chainId === 999 && ON_CHAIN_EARNINGS_CHAIN_IDS.has(chainId);
}

export function useCashdropPayoutClaims() {
  const { address } = useConnection();
  const chainId = useEffectiveChainId();
  const deployment = useDeployment();
  const publicClient = usePublicClient({ chainId });
  const useApi = useServerPayoutApi(chainId);

  const deploymentClaims = useMemo(
    () => deploymentPayoutClaims(deployment, address),
    [deployment, address]
  );

  const onChainEnabled =
    !useApi &&
    !!publicClient &&
    !!deployment?.airdrop &&
    !!address &&
    ON_CHAIN_EARNINGS_CHAIN_IDS.has(chainId);

  const enabled = !!address && !!deployment?.airdrop && (useApi || onChainEnabled || deploymentClaims.length > 0);

  const { data: remoteClaims = [], isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["cashdrop-payouts", chainId, address, deployment?.airdrop, useApi],
    queryFn: async () => {
      if (!address) return [];
      if (useApi) return fetchPayoutClaimsFromApi(chainId, address);
      if (!publicClient || !deployment?.airdrop) return [];
      return fetchOnChainEarningsClaims(publicClient, deployment.airdrop, address, chainId);
    },
    enabled: enabled && (useApi || onChainEnabled),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
  });

  const claims = useMemo(
    () => mergeEarningsClaims(remoteClaims, deploymentClaims),
    [remoteClaims, deploymentClaims]
  );

  const lastPayout = claims.length > 0 ? claims[claims.length - 1] : null;
  const totalUsdc = claims.reduce((sum, c) => sum + c.usdc, 0);

  return {
    claims,
    lastPayout,
    totalUsdc,
    isLoading: enabled && isLoading,
    isFetching,
    isError,
    error: error instanceof Error ? error.message : null,
    hasHistory: claims.length > 0,
  };
}
