import type { Address } from "viem";
import deployment31337 from "./deployments/31337.json";
import deployment998 from "./deployments/998.json";
import deployment999 from "./deployments/999.json";
import HyperpoolVaultAbi from "./abis/HyperpoolVault.json";
import ProjectXAdapterAbi from "./abis/ProjectXAdapter.json";
import MockERC20Abi from "./abis/MockERC20.json";
import ReferralRegistryAbi from "./abis/ReferralRegistry.json";
import MerkleAirdropAbi from "./abis/MerkleAirdrop.json";

/** Per-pool isolated Cashdrop state (mirrors the top-level fields, scoped to one HYPE-quoted pool). */
export type PoolCashdropState = {
  airdropEntries?: { address: Address; amount: string; minShares?: string }[];
  lastCashdropDistribution?: {
    distributionId: string;
    txHash: string;
    amount: string;
    entries: number;
    executedAt: string;
    harvestBlock?: string;
    harvestTimestamp?: string;
    timeWeighted?: boolean;
  };
  cashdropDistributionHistory?: {
    distributionId: string;
    txHash: string;
    executedAt: string;
    entries: { address: Address; amount: string }[];
  }[];
  cashdropWeightCheckpoint?: {
    blockNumber: string;
    timestamp: string;
    balances?: Record<string, string>;
  };
  vaultShareHolders?: { address: Address; shares: string }[];
  vaultDeployBlock?: string | number;
  merkleRoot?: string;
};

/**
 * A HYPE-quoted managed-LP pool (UPUMP/UBTC/UETH) deployed alongside the legacy HYPE/USDC vault.
 * These live in `Deployment.pools[]`; the top-level fields remain the legacy HYPE/USDC pool.
 * This pass adds only the type — multi-pool UI wiring is deferred.
 */
export type PoolDeployment = {
  key: string;
  label?: string;
  vault: Address;
  adapter: Address;
  airdrop: Address;
  oracle?: Address;
  pool: Address;
  quoteToken: Address;
  quoteSymbol?: string;
  quoteDecimals: number;
  baseToken: Address;
  baseSymbol?: string;
  baseDecimals: number;
  rewardToken: Address;
  referralRegistry?: Address;
  upperRangeBps?: number;
  lowerRangeBps?: number;
  twapWindow?: number;
  vaultDeployBlock?: string | number;
  cashdrop?: PoolCashdropState;
};

export type Deployment = {
  chainId: number;
  deployed?: boolean;
  hyperpoolVault?: Address;
  /** @deprecated alias for hyperpoolVault */
  liquidityVault?: Address;
  projectXAdapter?: Address;
  projectXNpm?: Address;
  projectXPool?: Address;
  referralRegistry?: Address;
  airdrop: Address;
  oracle?: Address;
  tokenKHYPE: Address;
  tokenUSDC: Address;
  airdropEntries?: { address: Address; amount: string; minShares?: string }[];
  lastCashdropDistribution?: {
    distributionId: string;
    txHash: string;
    amount: string;
    entries: number;
    executedAt: string;
    harvestBlock?: string;
    harvestTimestamp?: string;
    timeWeighted?: boolean;
  };
  cashdropDistributionHistory?: {
    distributionId: string;
    txHash: string;
    executedAt: string;
    entries: { address: Address; amount: string }[];
  }[];
  cashdropWeightCheckpoint?: {
    blockNumber: string;
    timestamp: string;
    balances?: Record<string, string>;
  };
  vaultDeployBlock?: string | number;
  vaultShareHolders?: { address: Address; shares: string }[];
  merkleRoot?: string;
  /** HYPE-quoted managed-LP pools (UPUMP/UBTC/UETH). Legacy HYPE/USDC stays in the top-level fields. */
  pools?: PoolDeployment[];
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function isLive(d: Deployment): boolean {
  if (d.deployed === false) return false;
  const vault = d.hyperpoolVault ?? d.liquidityVault;
  return !!vault && vault !== ZERO;
}

const DEPLOYMENTS: Record<number, Deployment> = {
  31337: deployment31337 as Deployment,
  998: deployment998 as Deployment,
  999: deployment999 as Deployment,
};

export function getDeployment(chainId: number): Deployment | null {
  const d = DEPLOYMENTS[chainId];
  if (!d || !isLive(d)) return null;
  return d;
}

export function getVaultAddress(d: Deployment): Address | undefined {
  return d.hyperpoolVault ?? d.liquidityVault;
}

export const abis = {
  vault: HyperpoolVaultAbi,
  adapter: ProjectXAdapterAbi,
  erc20: MockERC20Abi,
  referral: ReferralRegistryAbi,
  airdrop: MerkleAirdropAbi,
} as const;

export type TokenSymbol = "kHYPE" | "USDC";

export function getTokenAddress(deployment: Deployment, symbol: TokenSymbol): Address {
  return symbol === "kHYPE" ? deployment.tokenKHYPE : deployment.tokenUSDC;
}

export function getTokenDecimals(symbol: TokenSymbol): number {
  return symbol === "kHYPE" ? 18 : 6;
}

export function getChainDeploymentMeta(chainId: number): {
  configured: boolean;
  live: boolean;
  label: string;
} {
  const d = DEPLOYMENTS[chainId];
  if (!d) return { configured: false, live: false, label: `Chain ${chainId}` };
  return {
    configured: true,
    live: isLive(d),
    label: chainId === 998 ? "HyperEVM Testnet" : chainId === 999 ? "HyperEVM" : `Chain ${chainId}`,
  };
}

/** HYPE-quoted managed-LP pools from deployment JSON (legacy top-level unchanged). */
export function getPoolDeployments(chainId: number): PoolDeployment[] {
  const d = DEPLOYMENTS[chainId];
  if (!d?.pools?.length) return [];
  return d.pools.filter((p) => p.vault && p.vault !== ZERO);
}

export function getPoolByKey(chainId: number, key: string): PoolDeployment | null {
  return getPoolDeployments(chainId).find((p) => p.key === key) ?? null;
}
