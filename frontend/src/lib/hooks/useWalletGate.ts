"use client";

import { useConnection } from "wagmi";
import {
  ALLOWED_WALLETS,
  isAllowedWallet,
  isWalletGateActive,
  WALLET_GATE_ENABLED,
} from "@/lib/walletGate";

export function useWalletGate() {
  const { address, isConnected, status } = useConnection();
  const active = isWalletGateActive();
  const allowed = isAllowedWallet(address);
  const isChecking = status === "connecting" || status === "reconnecting";

  return {
    active,
    enabled: WALLET_GATE_ENABLED,
    allowlist: ALLOWED_WALLETS,
    address,
    isConnected,
    isChecking,
    allowed,
    /** Gate off, or connected wallet is on the allowlist. */
    canViewApp: !active || (isConnected && allowed),
    /** Gate on but allowlist env is empty (misconfiguration). */
    misconfigured: WALLET_GATE_ENABLED && ALLOWED_WALLETS.length === 0,
  };
}
