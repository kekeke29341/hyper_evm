"use client";

import { useConnection, useChainId } from "wagmi";
import { defaultChain, SUPPORTED_CHAINS } from "@/lib/wagmi/config";
import { hasLiveHyperpoolDeployment } from "@/lib/hyperpoolChains";

export const WRONG_NETWORK_ERROR = "WRONG_NETWORK";

export function getAppTargetChainLabel(chainId: number): string {
  const match = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (match) return `${match.label} (${chainId})`;
  return `Chain ${chainId}`;
}

/** Wallet on HyperEVM Testnet (998) or Mainnet (999) with a live Vault deployment. */
export function useAppChain() {
  const { isConnected } = useConnection();
  const walletChainId = useChainId();
  const targetChainId = defaultChain.id;
  const targetLabel = getAppTargetChainLabel(targetChainId);

  const isOnAppChain =
    isConnected && hasLiveHyperpoolDeployment(walletChainId);

  return {
    isConnected,
    isOnAppChain,
    walletChainId,
    targetChainId,
    targetLabel,
    hasTargetDeployment: hasLiveHyperpoolDeployment(targetChainId),
  };
}
