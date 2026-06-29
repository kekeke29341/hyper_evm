/** Admin dashboard — disabled in production unless explicitly enabled */
export const ADMIN_ENABLED = process.env.NEXT_PUBLIC_ADMIN_ENABLED === "true";

export {
  ALLOWED_WALLETS,
  WALLET_GATE_ENABLED,
  isAllowedWallet,
  isWalletGateActive,
  parseAllowedWallets,
} from "@/lib/walletGate";
