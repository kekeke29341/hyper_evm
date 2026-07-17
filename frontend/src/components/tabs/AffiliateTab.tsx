"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Copy, Check, Share2, Loader2 } from "lucide-react";
import { useConnection, usePublicClient } from "wagmi";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { tabPath } from "@/lib/routes";
import { defaultChain } from "@/lib/wagmi/config";
import { useBindReferrer, useRegisterReferrer } from "@/lib/hooks/useDeFi";
import { getDeployment } from "@/lib/contracts";
import { useReferralStats, useReferralLeaderboard } from "@/lib/hooks/useReferralAnalytics";
import { useReferralEarnings } from "@/lib/hooks/useReferralEarnings";
import { useReferralPayoutHistory } from "@/lib/hooks/useReferralPayoutHistory";
import { useAppChain } from "@/lib/hooks/useAppChain";
import { MainCard } from "@/components/ui/shared";
import { ReferralPayoutHistory } from "@/components/affiliate/ReferralPayoutHistory";
import {
  buildReferralUrl,
  captureReferralFromLocation,
  clearPendingReferrerAddress,
  loadPendingReferrerAddress,
} from "@/lib/referral/codeStorage";
import { resolveReferrer } from "@/lib/referral/resolveReferrer";

export function AffiliateTab() {
  const { showToast, isConnected, openWalletModal } = useApp();
  const { address } = useConnection();
  const { isOnAppChain, targetChainId, walletChainId } = useAppChain();
  const chainId = defaultChain.id;
  const referralDeployment = getDeployment(chainId);
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const [inviteAddress, setInviteAddress] = useState("");
  const [pendingReferrerFromLink, setPendingReferrerFromLink] = useState<string | null>(null);
  const publicClient = usePublicClient({ chainId });
  const { bindReferrer, isPending: bindPending } = useBindReferrer();
  const { registerReferrer, isPending: registerPending } = useRegisterReferrer();
  const { referralCount, registered, hasRefereeBoost, hasDeployment, hasReferralRegistry } =
    useReferralStats();
  const { data: refLeaderboard, isLoading: refLbLoading } = useReferralLeaderboard(5);
  const {
    commissionUsdc,
    claimableViaCashdrop,
    alreadyClaimedThisRound,
    isLoading: earningsLoading,
  } = useReferralEarnings();
  const payoutHistory = useReferralPayoutHistory();

  useEffect(() => {
    captureReferralFromLocation();
    const referrer = loadPendingReferrerAddress();
    if (referrer) {
      setInviteAddress(referrer);
      setPendingReferrerFromLink(referrer);
    }
  }, []);

  const refUrl =
    isConnected && registered && address && typeof window !== "undefined"
      ? buildReferralUrl(window.location.origin, address)
      : "";

  const copy = async () => {
    if (!refUrl) return;
    await navigator.clipboard.writeText(refUrl);
    setCopied(true);
    showToast(t("common.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnX = () => {
    if (!refUrl) return;
    const text =
      locale === "ja"
        ? encodeURIComponent("Hyperpool — マネージド LP。私のリンクから参加:")
        : encodeURIComponent("Hyperpool — managed LP on HyperEVM. Join via my link:");
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(refUrl)}`, "_blank");
  };

  const applyReferrer = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!isOnAppChain || walletChainId !== targetChainId) {
      showToast(t("affiliate.switchNetworkToApply"));
      return;
    }
    if (!referralDeployment?.referralRegistry || !publicClient) {
      if (!referralDeployment?.referralRegistry) showToast(t("affiliate.referralUnavailable"));
      return;
    }
    if (!inviteAddress.trim() && !pendingReferrerFromLink) return;

    try {
      const resolution = await resolveReferrer(
        publicClient,
        referralDeployment.referralRegistry,
        inviteAddress
      );
      if (resolution.kind === "invalid") {
        showToast(t("affiliate.inviteFailed"));
        return;
      }
      await bindReferrer(resolution.referrer);
      clearPendingReferrerAddress();
      setPendingReferrerFromLink(null);
      showToast(t("affiliate.applySuccess"));
    } catch {
      showToast(t("affiliate.inviteFailed"));
    }
  };

  const handleRegisterReferrer = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!isOnAppChain || walletChainId !== targetChainId) {
      showToast(t("affiliate.switchNetworkToApply"));
      return;
    }
    if (!referralDeployment?.referralRegistry) {
      showToast(t("affiliate.referralUnavailable"));
      return;
    }
    try {
      await registerReferrer();
      showToast(t("affiliate.registerSuccess"));
    } catch {
      showToast(t("affiliate.registerFailed"));
    }
  };

  const referredLabel = hasDeployment
    ? `${referralCount} ${locale === "ja" ? "人" : referralCount === 1 ? "User" : "Users"}`
    : "—";

  const commissionRate = registered || hasDeployment ? "15%" : "—";

  const commissionLabel = !isConnected
    ? t("affiliate.noCommissionYet")
    : registered && referralCount === 0
      ? "0.00"
      : referralCount === 0
        ? t("affiliate.noCommissionYet")
        : earningsLoading
          ? "…"
          : alreadyClaimedThisRound
            ? t("affiliate.roundClaimed")
            : commissionUsdc ?? t("affiliate.noCommissionYet");

  const leaderboardRows = refLeaderboard ?? [];

  const showLinkSection = isConnected && registered && !!address;
  const showRegisterSection =
    isConnected &&
    !registered &&
    hasDeployment &&
    hasReferralRegistry &&
    isOnAppChain &&
    walletChainId === targetChainId;
  const showConnectToCreate = !isConnected && hasReferralRegistry;
  const canApplyInvite = !!inviteAddress.trim() || !!pendingReferrerFromLink;

  const copyField = (
    value: string,
    onCopy: () => void,
    copiedState: boolean,
    copyLabel: string
  ) => (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        readOnly
        value={value}
        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-700 text-zinc-200 text-xs sm:text-sm font-mono truncate"
      />
      <button
        type="button"
        onClick={onCopy}
        className="px-3 py-2.5 rounded-xl bg-zinc-700 border border-zinc-600 hover:border-cyan-500/50 flex items-center justify-center gap-1 text-sm text-white shrink-0 min-h-[44px] sm:min-h-0"
      >
        {copiedState ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        <span>{copiedState ? t("common.copied") : copyLabel}</span>
      </button>
    </div>
  );

  return (
    <MainCard className="max-w-lg">
      <h2 className="text-lg font-semibold text-white mb-1">{t("affiliate.title")}</h2>
      <p className="text-xs text-zinc-500 mb-4">{t("affiliate.subtitle")}</p>

      {hasRefereeBoost && (
        <p className="text-xs text-cyan-400/90 mb-4 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          {t("affiliate.boostActive")}
        </p>
      )}

      {showLinkSection && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/25">
          <p className="text-sm font-medium text-white mb-1">{t("affiliate.yourLink")}</p>
          <p className="text-xs text-zinc-400 mb-4">{t("affiliate.linkSectionHint")}</p>
          {copyField(refUrl, copy, copied, t("common.copy"))}

          <button
            type="button"
            onClick={shareOnX}
            className="w-full flex items-center justify-center gap-2 py-2.5 mt-4 rounded-xl border border-zinc-700 text-sm text-zinc-300 hover:border-cyan-500/40 hover:text-white transition-colors"
          >
            <Share2 className="w-4 h-4" />
            {t("affiliate.shareX")}
          </button>
        </div>
      )}

      {pendingReferrerFromLink && !hasRefereeBoost && (
        <p className="text-xs text-cyan-400/90 mb-4 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 leading-relaxed">
          {t("affiliate.pendingReferrerLink")}
        </p>
      )}

      {showConnectToCreate && (
        <div className="mb-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <label className="text-sm text-zinc-300 block mb-1">{t("affiliate.createReferrer")}</label>
          <p className="text-xs text-zinc-500 mb-3">{t("affiliate.connectToCreateHint")}</p>
          <button
            type="button"
            onClick={openWalletModal}
            className="w-full px-4 py-2.5 rounded-xl gradient-btn text-sm font-semibold"
          >
            {t("affiliate.connectToCreate")}
          </button>
        </div>
      )}

      {showRegisterSection && (
        <div className="mb-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <label className="text-sm text-zinc-300 block mb-1">{t("affiliate.createReferrer")}</label>
          <p className="text-xs text-zinc-500 mb-3">{t("affiliate.createReferrerHint")}</p>
          <button
            type="button"
            onClick={handleRegisterReferrer}
            disabled={registerPending}
            className="w-full px-4 py-2.5 rounded-xl gradient-btn text-sm font-semibold disabled:opacity-50 min-h-[44px]"
          >
            {registerPending ? "…" : t("affiliate.activateReferrer")}
          </button>
        </div>
      )}

      {!isConnected && !showConnectToCreate && (
        <p className="text-xs text-zinc-500 mb-4">{t("affiliate.connectForLink")}</p>
      )}

      {!hasReferralRegistry && (
        <p className="text-xs text-amber-500/90 mb-4 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          {t("affiliate.referralUnavailable")}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs text-emerald-400/80 mb-2">{t("affiliate.referrer")}</p>
          <p className="text-sm text-zinc-200">
            {t("affiliate.referrerBenefit")}{" "}
            <strong className="text-emerald-400">{t("affiliate.referrerBonus")}</strong>{" "}
            {t("affiliate.referrerSuffix")}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <p className="text-xs text-cyan-400/80 mb-2">{t("affiliate.referee")}</p>
          <p className="text-sm text-zinc-200">
            {t("affiliate.refereeBenefit")}{" "}
            <strong className="text-cyan-400">{t("affiliate.refereeBoost")}</strong>{" "}
            {t("affiliate.refereeSuffix")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {[
          { label: t("affiliate.totalReferred"), value: referredLabel },
          { label: t("affiliate.commissionRate"), value: commissionRate },
          { label: t("affiliate.totalCommissions"), value: commissionLabel },
        ].map((s) => (
          <div key={s.label} className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-center min-w-0">
            <p className="text-[10px] text-zinc-500 leading-snug">{s.label}</p>
            <p className="text-sm font-bold text-white mt-1 break-words">{s.value}</p>
          </div>
        ))}
      </div>

      {claimableViaCashdrop && (
        <p className="text-[10px] text-emerald-400/90 mb-2">
          <Link href={tabPath("cashdrop")} className="underline hover:text-emerald-300">
            {t("affiliate.claimViaCashdrop")}
          </Link>
          {commissionUsdc ? ` (${commissionUsdc} USDC)` : null}
        </p>
      )}

      <p className="text-[10px] text-zinc-600 mb-2 leading-relaxed">{t("affiliate.commissionNote")}</p>
      <p className="text-[10px] text-amber-500/80 mb-6 leading-relaxed">{t("affiliate.normalizeNote")}</p>

      <ReferralPayoutHistory {...payoutHistory} />

      <div className="mb-6 pt-4 border-t border-zinc-800">
        <label className="text-sm text-zinc-300 block mb-1">{t("affiliate.haveReferrer")}</label>
        <p className="text-xs text-zinc-500 mb-2">{t("affiliate.referrerHint")}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={inviteAddress}
            onChange={(e) => setInviteAddress(e.target.value)}
            placeholder="0x…"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono outline-none focus:border-cyan-500/50"
          />
          <button
            type="button"
            onClick={applyReferrer}
            disabled={bindPending || (isConnected && (!isOnAppChain || walletChainId !== targetChainId)) || !canApplyInvite}
            className="px-4 py-2.5 rounded-xl gradient-btn text-sm font-semibold disabled:opacity-50 shrink-0 min-h-[44px] sm:min-h-0"
          >
            {bindPending ? "…" : t("common.apply")}
          </button>
        </div>
      </div>

      <h3 className="text-sm font-medium text-zinc-300 mb-1">{t("affiliate.leaderboard")}</h3>
      <p className="text-[10px] text-zinc-600 mb-3">{t("affiliate.leaderboardSub")}</p>
      <div className="rounded-xl border border-zinc-700 overflow-x-auto">
        <table className="w-full min-w-[16rem] text-sm">
          <thead className="bg-zinc-800/80 text-zinc-500 text-xs">
            <tr>
              <th className="py-2 px-3 text-left whitespace-nowrap">{t("affiliate.rank")}</th>
              <th className="py-2 px-3 text-left whitespace-nowrap">{t("affiliate.wallet")}</th>
              <th className="py-2 px-3 text-right whitespace-nowrap">{t("affiliate.referrals")}</th>
            </tr>
          </thead>
          <tbody>
            {refLbLoading ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  {t("common.loading")}
                </td>
              </tr>
            ) : !leaderboardRows.length ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-zinc-500 text-xs">
                  {hasDeployment ? t("affiliate.leaderboardEmpty") : t("affiliate.leaderboardUnavailable")}
                </td>
              </tr>
            ) : (
              leaderboardRows.map((row) => (
                <tr key={row.rank} className="border-t border-zinc-800">
                  <td className="py-2 px-3 text-zinc-500 whitespace-nowrap">#{row.rank}</td>
                  <td className="py-2 px-3 font-mono text-zinc-300 max-w-[8rem] sm:max-w-none truncate">
                    {row.address}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-medium whitespace-nowrap">
                    {row.referrals} {locale === "ja" ? "人" : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </MainCard>
  );
}
