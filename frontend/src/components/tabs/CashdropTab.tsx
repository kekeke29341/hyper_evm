"use client";

import { useEffect } from "react";
import { Loader2, Sparkles, Users, TrendingUp } from "lucide-react";
import { MainCard, PrimaryButton, StatPill } from "@/components/ui/shared";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useCashdrop, useEpochCountdown } from "@/lib/hooks/useDeFi";

type CashdropTabProps = {
  onGoToPoints?: () => void;
  onGoToAffiliate?: () => void;
};

export function CashdropTab({ onGoToPoints, onGoToAffiliate }: CashdropTabProps) {
  const { showToast, isConnected, openWalletModal } = useApp();
  const { t } = useI18n();
  const {
    hasDeployment,
    hasRewards,
    availableUsdc,
    alreadyClaimed,
    expired,
    rootSet,
    claim,
    isPending,
    isSuccess,
  } = useCashdrop();
  const epoch = useEpochCountdown();

  useEffect(() => {
    if (isSuccess) showToast(t("points.cashdropSuccess"));
  }, [isSuccess, showToast, t]);

  const handleClaim = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!hasDeployment) {
      showToast(t("swap.deployHint"));
      return;
    }
    try {
      await claim();
    } catch {
      showToast(t("points.cashdropEmpty"));
    }
  };

  const statusMessage = !rootSet
    ? t("points.cashdropEmptyHint")
    : expired
      ? t("points.cashdropEmpty")
      : alreadyClaimed
        ? t("points.cashdropEmpty")
        : !hasRewards
          ? t("points.cashdropEmpty")
          : null;

  return (
    <MainCard>
      <h2 className="text-lg font-semibold text-white mb-1">{t("points.cashdropSection")}</h2>
      <p className="text-xs text-zinc-500 mb-4">{t("points.cashdropDesc")}</p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <StatPill
          label={t("points.cashdropAvailable")}
          value={hasRewards ? availableUsdc : "0.00"}
          accent="emerald"
        />
        <StatPill
          label={t("points.cashdropNext")}
          value={epoch?.formatted ?? "—"}
          accent="cyan"
        />
        <StatPill
          label={t("points.cashdropTotal")}
          value={alreadyClaimed ? availableUsdc : "$0.00"}
          accent="violet"
        />
      </div>

      {isPending ? (
        <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t("common.loading")}
        </div>
      ) : hasRewards ? (
        <PrimaryButton onClick={handleClaim} disabled={isPending}>
          {t("points.claimCashdrop")} {availableUsdc} USDC
        </PrimaryButton>
      ) : (
        <>
          <div className="p-4 rounded-xl border border-dashed border-zinc-700 text-center mb-4">
            <Sparkles className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-400">{statusMessage}</p>
            <p className="text-xs text-zinc-600 mt-1">{t("points.cashdropEmptyHint")}</p>
          </div>
          <PrimaryButton disabled={!isConnected} onClick={isConnected ? undefined : openWalletModal}>
            {isConnected ? t("common.claim") : t("common.connectWallet")}
          </PrimaryButton>
        </>
      )}

      <div className="mt-6 pt-4 border-t border-zinc-800">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onGoToPoints}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700 hover:border-emerald-500/30 transition-colors text-left"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm text-white">{t("tabs.points")}</p>
              <p className="text-[11px] text-zinc-500">{t("hero.points.subline")}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onGoToAffiliate}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700 hover:border-cyan-500/30 transition-colors text-left"
          >
            <Users className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <p className="text-sm text-white">{t("tabs.affiliate")}</p>
              <p className="text-[11px] text-zinc-500">{t("hero.affiliate.subline")}</p>
            </div>
          </button>
        </div>
      </div>
    </MainCard>
  );
}
