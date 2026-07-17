"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { tabPath } from "@/lib/routes";
import { useWallet } from "@/lib/hooks/useWallet";
import { useVaultBalance } from "@/lib/hooks/useDeFi";
import { useAlternateChainVaultBalance } from "@/lib/hooks/useAlternateChainVaultBalance";
import { hyperEvmMainnet } from "@/lib/wagmi/config";
import { getAppTargetChainLabel } from "@/lib/hooks/useAppChain";

export function MainnetFundsBanner() {
  const { t } = useI18n();
  const { switchNetwork, isSwitching } = useWallet();
  const vaultBalance = useVaultBalance();
  const { alternate, isCheckingAlternate } = useAlternateChainVaultBalance();

  if (vaultBalance.hasVaultPosition || isCheckingAlternate || !alternate) {
    return null;
  }

  const mainnetLabel = getAppTargetChainLabel(hyperEvmMainnet.id);
  const valueLabel = alternate.valueUsd.toFixed(2);

  return (
    <div className="max-w-6xl mx-auto mb-4 px-4 py-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-cyan-100">{t("network.mainnetFundsTitle")}</p>
          <p className="text-xs text-cyan-100/70 mt-1">
            {t("network.mainnetFundsBody")
              .replace("{value}", valueLabel)
              .replace("{chain}", mainnetLabel)}
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
        <button
          type="button"
          onClick={() => switchNetwork(alternate.chainId)}
          disabled={isSwitching}
          className="px-3 py-2 rounded-lg text-xs font-medium border border-cyan-500/50 text-cyan-100 bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-60 transition-colors"
        >
          {isSwitching ? t("network.switching") : t("network.switchToMainnetFunds")}
        </button>
        <Link
          href={tabPath("liquidity")}
          className="px-3 py-2 rounded-lg text-xs font-medium text-center border border-zinc-600 text-zinc-200 hover:border-cyan-500/40 transition-colors"
        >
          {t("network.openWithdraw")}
        </Link>
      </div>
    </div>
  );
}
