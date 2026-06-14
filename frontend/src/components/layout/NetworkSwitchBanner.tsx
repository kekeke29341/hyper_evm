"use client";

import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useWallet } from "@/lib/hooks/useWallet";
import { useAppChain } from "@/lib/hooks/useAppChain";

function applyParams(text: string, params: Record<string, string>) {
  return Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), text);
}

export function NetworkSwitchBanner() {
  const { t } = useI18n();
  const { isConnected, isOnAppChain, walletChainId, targetChainId, targetLabel } = useAppChain();
  const { switchNetwork, isSwitching } = useWallet();

  if (!isConnected || isOnAppChain) return null;

  return (
    <div className="max-w-md mx-auto mb-4 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-200">{t("network.wrongNetworkTitle")}</p>
          <p className="text-xs text-amber-200/70 mt-1">
            {applyParams(t("network.wrongNetworkBody"), {
              chainId: String(walletChainId),
              target: targetLabel,
            })}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => switchNetwork(targetChainId)}
        disabled={isSwitching}
        className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium border border-amber-500/50 text-amber-100 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-60 transition-colors"
      >
        {isSwitching
          ? t("network.switching")
          : applyParams(t("network.switchTo"), { target: targetLabel })}
      </button>
    </div>
  );
}
