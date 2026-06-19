/** Vault ERC20 shares use USDC-scale units (6 decimals), not 18 */
export const VAULT_SHARE_DECIMALS = 6;

/** Locked on first deposit — excluded from Cashdrop shareholder snapshots */
export const VAULT_DEAD_SHARE_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

export type TabId = "dashboard" | "deposit" | "liquidity" | "cashdrop" | "affiliate";

export const TAB_IDS: TabId[] = ["dashboard", "deposit", "liquidity", "cashdrop", "affiliate"];

export { BRIDGE_CHAINS, CHAINS, EVM_BRIDGE_CHAINS } from "@/lib/lifi/config";

/** Project X WHYPE/USDC 0.05% pool — reference metrics (GeckoTerminal, 2026-06) */
export const PROJECT_X_POOL = {
  id: "whype-usdc-005",
  pair: "HYPE/USDC",
  poolAddress: "0x6c9A33E3b592C0d65B3Ba59355d5Be0d38259285",
  feeTier: "0.05%",
  referenceApr: "75%",
  referenceAprNum: 75,
  netAprEstimate: "52.5%",
  netAprNum: 52.5,
  userShareBps: 7000,
  operatorShareBps: 3000,
  tvl: "$14.3M",
  volume24h: "$151M",
  upperRangePct: 10,
  lowerRangePct: 30,
} as const;

export const POOLS = [PROJECT_X_POOL];

export const AFFILIATE_LEADERBOARD = [
  { rank: 1, address: "0x1a...3b", reward: "1,240 USDC" },
  { rank: 2, address: "0x4c...5d", reward: "980 USDC" },
  { rank: 3, address: "0x6e...7f", reward: "720 USDC" },
  { rank: 4, address: "0x8a...9b", reward: "540 USDC" },
  { rank: 5, address: "0x2c...3d", reward: "410 USDC" },
];

export const WALLETS = [
  { name: "MetaMask", chains: ["HyperEVM", "Ethereum"] },
  { name: "Phantom", chains: ["Solana", "HyperEVM"] },
  { name: "WalletConnect", chains: ["Multi-chain"] },
  { name: "Coinbase Wallet", chains: ["Ethereum", "Base"] },
];

/** JST claim window for daily USDC cashdrop */
export const CASHDROP_JST = {
  startHour: 7,
  endHour: 9,
  timezone: "Asia/Tokyo",
} as const;
