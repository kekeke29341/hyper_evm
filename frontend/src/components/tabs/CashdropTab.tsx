"use client";

import Link from "next/link";
import { Sparkles, Users } from "lucide-react";
import { MainCard, PrimaryButton, StatPill } from "@/components/ui/shared";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { tabPath } from "@/lib/routes";
import { useCashdrop, useEpochCountdown } from "@/lib/hooks/useDeFi";

export function CashdropTab() {
  const { isConnected, openWalletModal } = useApp();
  const { t } = useI18n();
  const {
    hasRewards,
    availableUsdc,
    lastDistribution,
  } = useCashdrop();
  const epoch = useEpochCountdown();
  const displayAvailable = hasRewards ? availableUsdc : "0.00";
  const displayHasRewards = hasRewards;
  const statusMessage = displayHasRewards ? t("cashdrop.autoPaidHint") : t("cashdrop.emptyHint");

  return (
    <MainCard>
      <h2 className="text-lg font-semibold text-white mb-1">{t("cashdrop.title")}</h2>
      <p className="text-xs text-zinc-500 mb-1">{t("cashdrop.subtitle")}</p>
      <p className="text-[11px] text-cyan-400/90 mb-4">{t("cashdrop.window")}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
        <StatPill
          label={t("cashdrop.available")}
          value={displayHasRewards ? displayAvailable : "0.00"}
          accent="emerald"
        />
        <StatPill
          label={t("cashdrop.nextPayout")}
          value={epoch.formatted}
          accent="cyan"
        />
        <StatPill label={t("cashdrop.feeShare")} value={t("cashdrop.feeShareValue")} accent="violet" />
      </div>

      {displayHasRewards ? (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-center mb-4">
          <p className="text-sm text-emerald-200/90">
            {t("cashdrop.autoPaidAmount")} {displayAvailable} USDC
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {lastDistribution?.txHash ? `${t("cashdrop.lastTx")}: ${lastDistribution.txHash.slice(0, 10)}…` : t("cashdrop.autoPaidHint")}
          </p>
        </div>
      ) : (
        <>
          <div className="p-4 rounded-xl border border-dashed border-zinc-700 text-center mb-4">
            <Sparkles className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-400">{statusMessage}</p>
            <p className="text-xs text-zinc-600 mt-1">{t("cashdrop.emptyHint")}</p>
          </div>
          <PrimaryButton disabled={isConnected} onClick={isConnected ? undefined : openWalletModal}>
            {isConnected ? t("cashdrop.waitForAutoPayout") : t("common.connectWallet")}
          </PrimaryButton>
        </>
      )}

      <p className="mt-4 text-[10px] text-zinc-600 space-y-1">
        <span className="block">{t("cashdrop.usdcOnlyNote")}</span>
        <span className="block">{t("cashdrop.hypeFeeNote")}</span>
        <span className="block">{t("cashdrop.shareGateNote")}</span>
        <span className="block">{t("cashdrop.operatorNote")}</span>
      </p>

      <div className="mt-6 pt-4 border-t border-zinc-800">
        <Link
          href={tabPath("affiliate")}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700 hover:border-cyan-500/30 transition-colors text-left"
        >
          <Users className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <p className="text-sm text-white">{t("tabs.affiliate")}</p>
            <p className="text-[11px] text-zinc-500">{t("hero.affiliate.subline")}</p>
          </div>
        </Link>
      </div>
    </MainCard>
  );
}
