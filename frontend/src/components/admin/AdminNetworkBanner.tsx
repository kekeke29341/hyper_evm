"use client";

import { AlertTriangle } from "lucide-react";
import { useConnection, useChainId } from "wagmi";
import { defaultChain } from "@/lib/wagmi/config";
import { getDeployment } from "@/lib/contracts";
import { useWallet } from "@/lib/hooks/useWallet";
import { AdminButton } from "./AdminUi";

export function AdminNetworkBanner() {
  const { isConnected } = useConnection();
  const chainId = useChainId();
  const { switchNetwork, isSwitching } = useWallet();

  if (!isConnected) return null;

  const targetChainId = defaultChain.id;
  const onTarget = chainId === targetChainId && getDeployment(chainId);
  if (onTarget) return null;

  const targetLabel =
    targetChainId === 998 ? "HyperEVM Testnet (998)" : targetChainId === 999 ? "HyperEVM Mainnet (999)" : `Chain ${targetChainId}`;

  return (
    <div className="mb-4 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-2 flex-1">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-200">Wrong network for admin operations</p>
          <p className="text-xs text-amber-200/70 mt-1">
            Wallet is on chain <span className="font-mono">{chainId}</span>. Switch to{" "}
            <strong>{targetLabel}</strong> to submit owner transactions.
          </p>
        </div>
      </div>
      <AdminButton
        variant="secondary"
        onClick={() => switchNetwork(targetChainId)}
        disabled={isSwitching}
      >
        {isSwitching ? "Switching…" : `Switch to ${targetLabel}`}
      </AdminButton>
    </div>
  );
}
