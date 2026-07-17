"use client";

import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useConnection, usePublicClient } from "wagmi";
import { VAULT_SHARE_DECIMALS } from "@/lib/constants";
import { abis, getDeployment, getVaultAddress } from "@/lib/contracts";
import {
  alternateHyperpoolChainId,
  hasLiveHyperpoolDeployment,
} from "@/lib/hyperpoolChains";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";

/** When the wallet is on testnet but shares live on mainnet (or vice versa). */
export function useAlternateChainVaultBalance() {
  const { address } = useConnection();
  const chainId = useEffectiveChainId();
  const altChainId = alternateHyperpoolChainId(chainId);
  const altDeployment = altChainId ? getDeployment(altChainId) : null;
  const altVault = altDeployment ? getVaultAddress(altDeployment) : undefined;
  const publicClient = usePublicClient({ chainId: altChainId ?? undefined });

  const { data, isFetching } = useQuery({
    queryKey: ["vault-balance-alt", altChainId, address, altVault],
    enabled:
      !!address &&
      !!altChainId &&
      !!altVault &&
      !!publicClient &&
      hasLiveHyperpoolDeployment(chainId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!publicClient || !altVault || !address) return null;
      const [sharesRaw, assets] = await Promise.all([
        publicClient.readContract({
          address: altVault,
          abi: abis.vault,
          functionName: "balanceOf",
          args: [address],
        }),
        publicClient.readContract({
          address: altVault,
          abi: abis.vault,
          functionName: "totalAssetsUsdc",
        }),
      ]);
      const shares = sharesRaw as bigint;
      const sharesNum = parseFloat(formatUnits(shares, VAULT_SHARE_DECIMALS));
      const supply = await publicClient.readContract({
        address: altVault,
        abi: abis.vault,
        functionName: "totalSupply",
      });
      const supplyNum = parseFloat(formatUnits(supply as bigint, VAULT_SHARE_DECIMALS));
      const nav = parseFloat(formatUnits(assets as bigint, 6));
      const valueUsd = supplyNum > 0 ? nav * (sharesNum / supplyNum) : 0;
      return { shares: sharesNum, valueUsd, chainId: altChainId!, vault: altVault };
    },
  });

  return {
    alternate: data && data.shares > 0 ? data : null,
    isCheckingAlternate: isFetching,
  };
}
