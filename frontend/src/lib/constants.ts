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
  netAprEstimate: "50.25%",
  netAprNum: 50.25,
  userShareBps: 6700,
  operatorShareBps: 3300,
  tvl: "$14.3M",
  volume24h: "$151M",
  upperRangePct: 10,
  lowerRangePct: 30,
} as const;

/** Managed LP range — fixed for all users (no per-user selection) */
export const MANAGED_LP_RANGE = {
  upperPct: PROJECT_X_POOL.upperRangePct,
  lowerPct: PROJECT_X_POOL.lowerRangePct,
  label: `+${PROJECT_X_POOL.upperRangePct}% / −${PROJECT_X_POOL.lowerRangePct}%`,
} as const;

export const POOLS = [PROJECT_X_POOL];

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
