"use client";

import { useChainId, useConnection } from "wagmi";
import { getDeployment } from "@/lib/contracts";
import { defaultChain } from "@/lib/wagmi/config";

/**
 * Chain ID used for deployment reads. When disconnected, uses the app default (testnet).
 * When connected on a chain without a live deployment, falls back to default instead of
 * querying the wrong RPC (avoids crashes / CSP violations on local Anvil RPC).
 */
export function useEffectiveChainId(): number {
  const chainId = useChainId();
  const { address } = useConnection();
  if (!address) return defaultChain.id;
  if (getDeployment(chainId)) return chainId;
  return defaultChain.id;
}
