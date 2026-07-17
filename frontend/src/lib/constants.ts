/** Vault ERC20 shares use USDC-scale units (6 decimals), not 18 */
export const VAULT_SHARE_DECIMALS = 6;

/** Locked on first deposit — excluded from Cashdrop shareholder snapshots */
export const VAULT_DEAD_SHARE_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

export type TabId = "dashboard" | "deposit" | "liquidity" | "cashdrop" | "affiliate";

export const TAB_IDS: TabId[] = ["dashboard", "deposit", "liquidity", "cashdrop", "affiliate"];

export { BRIDGE_CHAINS, CHAINS, EVM_BRIDGE_CHAINS } from "@/lib/lifi/config";

/** Project X WHYPE/USDC 0.3% pool — reference metrics (GeckoTerminal, 2026-06) */
export const PROJECT_X_POOL = {
  id: "whype-usdc-030",
  pair: "HYPE/USDC",
  poolAddress: "0x422e586C906eb241f784B4F5a633c2C7e59A2F54",
  feeTier: "0.3%",
  referenceApr: "64%",
  referenceAprNum: 64,
  netAprEstimate: "57%",
  netAprNum: 57,
  userShareBps: 6000,
  operatorShareBps: 700,
  ownerShareBps: 3300,
  tvl: "$8.6M",
  volume24h: "$23M",
  upperRangePct: 10,
  lowerRangePct: 17,
  /** Legacy +10% / −30% width — used to scale displayed APR when range narrows */
  aprBaselineWidthPct: 40,
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

/** JST payout window for daily USDC cashdrop (ops run ~7:00; users see ~9:00) */
export const CASHDROP_JST = {
  processingStartHour: 7,
  payoutHour: 9,
  timezone: "Asia/Tokyo",
} as const;
