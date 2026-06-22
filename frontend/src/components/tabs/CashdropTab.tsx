"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Users } from "lucide-react";
import { MainCard, PrimaryButton, StatPill } from "@/components/ui/shared";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { tabPath } from "@/lib/routes";
import { useCashdrop, useEpochCountdown } from "@/lib/hooks/useDeFi";
import { DEMO_CASHDROP } from "@/lib/demo/data";
import { useGuestDemo } from "@/lib/hooks/useGuestDemo";

export function CashdropTab() {
  const { showToast, isConnected, openWalletModal } = useApp();
  const { isGuestDemo } = useGuestDemo();
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
  const inClaimWindow = epoch.isClaimWindow;
  const displayAvailable = isGuestDemo ? DEMO_CASHDROP.availableUsdc : hasRewards ? availableUsdc : "0.00";
  const displayHasRewards = isGuestDemo || hasRewards;
  const canClaim = displayHasRewards && inClaimWindow && isConnected;
  const showDemoClaimPreview = isGuestDemo && displayHasRewards;

  useEffect(() => {
    if (isSuccess) showToast(t("cashdrop.claimSuccess"));
  }, [isSuccess, showToast, t]);

  const handleClaim = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!hasDeployment) {
      showToast(t("deposit.testnetNote"));
      return;
    }
    if (!inClaimWindow) {
      showToast(t("cashdrop.outsideWindow"));
      return;
    }
    try {
      await claim();
    } catch {
      showToast(t("cashdrop.claimEmpty"));
    }
  };

  const statusMessage = !rootSet
    ? t("cashdrop.emptyHint")
    : expired
      ? t("cashdrop.expired")
      : alreadyClaimed
        ? t("cashdrop.alreadyClaimed")
        : hasRewards && !inClaimWindow
          ? t("cashdrop.outsideWindow")
          : !hasRewards
            ? t("cashdrop.claimEmpty")
            : null;

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
          label={inClaimWindow ? t("cashdrop.claimWindowOpen") : t("cashdrop.nextWindow")}
          value={epoch.formatted}
          accent="cyan"
        />
        <StatPill label={t("cashdrop.feeShare")} value="70%" accent="violet" />
      </div>

      {isPending ? (
        <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t("common.loading")}
        </div>
      ) : canClaim ? (
        <PrimaryButton onClick={handleClaim} disabled={isPending}>
          {t("cashdrop.claim")} {displayAvailable} USDC
        </PrimaryButton>
      ) : showDemoClaimPreview && inClaimWindow ? (
        <PrimaryButton onClick={openWalletModal}>
          {t("cashdrop.claim")} {displayAvailable} USDC
        </PrimaryButton>
      ) : displayHasRewards && !inClaimWindow ? (
        <>
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-center mb-4">
            <p className="text-sm text-amber-200/90">{t("cashdrop.outsideWindow")}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {t("cashdrop.nextWindow")}: {epoch.formatted}
            </p>
          </div>
          <PrimaryButton disabled>{t("cashdrop.claim")} {displayAvailable} USDC</PrimaryButton>
        </>
      ) : (
        <>
          <div className="p-4 rounded-xl border border-dashed border-zinc-700 text-center mb-4">
            <Sparkles className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-400">{statusMessage}</p>
            <p className="text-xs text-zinc-600 mt-1">{t("cashdrop.emptyHint")}</p>
          </div>
          <PrimaryButton disabled={!isConnected} onClick={isConnected ? undefined : openWalletModal}>
            {isConnected ? t("common.claim") : t("common.connectWallet")}
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
