import { getDeployment } from "@/lib/contracts";
import { hyperEvmMainnet, hyperEvmTestnet } from "@/lib/wagmi/config";

/** Chains where Hyperpool Vault contracts are deployed. */
export const HYPERPOOL_CHAIN_IDS = [hyperEvmTestnet.id, hyperEvmMainnet.id] as const;

export type HyperpoolChainId = (typeof HYPERPOOL_CHAIN_IDS)[number];

export function isHyperpoolChainId(chainId: number): chainId is HyperpoolChainId {
  return (HYPERPOOL_CHAIN_IDS as readonly number[]).includes(chainId);
}

export function hasLiveHyperpoolDeployment(chainId: number): boolean {
  return isHyperpoolChainId(chainId) && getDeployment(chainId) !== null;
}

export function alternateHyperpoolChainId(chainId: number): HyperpoolChainId | null {
  if (chainId === hyperEvmTestnet.id) return hyperEvmMainnet.id;
  if (chainId === hyperEvmMainnet.id) return hyperEvmTestnet.id;
  return null;
}
