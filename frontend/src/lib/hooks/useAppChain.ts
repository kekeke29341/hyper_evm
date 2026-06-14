"use client";

import { useConnection, useChainId } from "wagmi";
import { getDeployment } from "@/lib/contracts";
import { defaultChain, SUPPORTED_CHAINS } from "@/lib/wagmi/config";

export const WRONG_NETWORK_ERROR = "WRONG_NETWORK";

export function getAppTargetChainLabel(chainId: number): string {
  const match = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (match) return `${match.label} (${chainId})`;
  return `Chain ${chainId}`;
}

/** Wallet must be on the app default chain with a live deployment (e.g. 998 on Vercel). */
export function useAppChain() {
  const { isConnected } = useConnection();
  const walletChainId = useChainId();
  const targetChainId = defaultChain.id;
  const targetLabel = getAppTargetChainLabel(targetChainId);
  const targetDeployment = getDeployment(targetChainId);

  const isOnAppChain =
    isConnected && walletChainId === targetChainId && targetDeployment !== null;

  return {
    isConnected,
    isOnAppChain,
    walletChainId,
    targetChainId,
    targetLabel,
    hasTargetDeployment: targetDeployment !== null,
  };
}
