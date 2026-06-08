import type { Address } from "viem";
import deployment31337 from "./deployments/31337.json";
import deployment998 from "./deployments/998.json";
import deployment999 from "./deployments/999.json";
import ProjectXRouterAbi from "./abis/ProjectXRouter.json";
import ProjectXFactoryAbi from "./abis/ProjectXFactory.json";
import ProjectXPairAbi from "./abis/ProjectXPair.json";
import MockERC20Abi from "./abis/MockERC20.json";
import PointsDistributorAbi from "./abis/PointsDistributor.json";
import ReferralRegistryAbi from "./abis/ReferralRegistry.json";
import MerkleAirdropAbi from "./abis/MerkleAirdrop.json";

export type Deployment = {
  chainId: number;
  deployed?: boolean;
  factory: Address;
  router: Address;
  pair: Address;
  pointsDistributor: Address;
  referralRegistry: Address;
  airdrop: Address;
  oracle?: Address;
  tokenKHYPE: Address;
  tokenUSDC: Address;
  airdropEntries?: { address: Address; amount: string }[];
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function isLive(d: Deployment): boolean {
  if (d.deployed === false) return false;
  return d.factory !== ZERO && d.router !== ZERO;
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

export const abis = {
  router: ProjectXRouterAbi,
  factory: ProjectXFactoryAbi,
  pair: ProjectXPairAbi,
  erc20: MockERC20Abi,
  points: PointsDistributorAbi,
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
