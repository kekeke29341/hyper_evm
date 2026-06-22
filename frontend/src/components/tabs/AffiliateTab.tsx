"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Copy, Check, Share2, Loader2 } from "lucide-react";
import { keccak256, toBytes } from "viem";
import { useConnection } from "wagmi";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { tabPath } from "@/lib/routes";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import {
  useDeployment,
  useEnterInvitationCode,
  useRegisterReferralCode,
} from "@/lib/hooks/useDeFi";
import { useReferralStats, useReferralLeaderboard } from "@/lib/hooks/useReferralAnalytics";
import { useReferralEarnings } from "@/lib/hooks/useReferralEarnings";
import { DEMO_AFFILIATE, DEMO_AFFILIATE_LEADERBOARD } from "@/lib/demo/data";
import { useGuestDemo } from "@/lib/hooks/useGuestDemo";
import { useAppChain } from "@/lib/hooks/useAppChain";
import { MainCard } from "@/components/ui/shared";
import {
  buildReferralUrl,
  clearPendingReferralCode,
  isValidReferralCodePlain,
  loadPendingReferralCode,
  loadReferralCode,
  saveReferralCode,
} from "@/lib/referral/codeStorage";

export function AffiliateTab() {
  const { showToast, isConnected, openWalletModal } = useApp();
  const { address } = useConnection();
  const { isGuestDemo } = useGuestDemo();
  const { isOnAppChain } = useAppChain();
  const chainId = useEffectiveChainId();
  const { t, locale } = useI18n();
  const deployment = useDeployment();
  const [copied, setCopied] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [restoreCode, setRestoreCode] = useState("");
  const [savedPlainCode, setSavedPlainCode] = useState<string | null>(null);
  const { enterCode, isPending: enterPending } = useEnterInvitationCode();
  const { registerCode, isPending: registerPending } = useRegisterReferralCode();
  const { referralCount, registered, referrerCodeHash, hasRefereeBoost, hasDeployment, hasReferralRegistry } =
    useReferralStats();
  const { data: refLeaderboard, isLoading: refLbLoading } = useReferralLeaderboard(5);
  const {
    commissionUsdc,
    claimableViaCashdrop,
    alreadyClaimedThisRound,
    isLoading: earningsLoading,
  } = useReferralEarnings();

  useEffect(() => {
    const pending = loadPendingReferralCode();
    if (pending) setInviteCode(pending);
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      setSavedPlainCode(null);
      return;
    }
    setSavedPlainCode(loadReferralCode(chainId, address));
  }, [isConnected, address, chainId, registered]);

  const plainCode = isGuestDemo ? "XM79B4" : savedPlainCode;
  const refUrl =
    plainCode && typeof window !== "undefined"
      ? buildReferralUrl(window.location.origin, plainCode)
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
        ? encodeURIComponent("Hyperpool — Project X 代理 LP。私のリンクから参加:")
        : encodeURIComponent("Hyperpool — managed LP on Project X. Join via my link:");
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(refUrl)}`, "_blank");
  };

  const applyCode = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!isOnAppChain) {
      showToast(t("affiliate.switchNetworkToApply"));
      return;
    }
    if (!deployment?.referralRegistry || !inviteCode.trim()) {
      if (!deployment?.referralRegistry) showToast(t("affiliate.referralUnavailable"));
      return;
    }
    if (!isValidReferralCodePlain(inviteCode)) {
      showToast(t("affiliate.codeInvalid"));
      return;
    }
    try {
      const code = keccak256(toBytes(inviteCode.trim()));
      await enterCode(code);
      clearPendingReferralCode();
      showToast(t("affiliate.applySuccess"));
    } catch {
      showToast(t("affiliate.inviteFailed"));
    }
  };

  const handleRegisterCode = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!isOnAppChain) {
      showToast(t("affiliate.switchNetworkToApply"));
      return;
    }
    if (!deployment?.referralRegistry || !newCode.trim()) {
      if (!deployment?.referralRegistry) showToast(t("affiliate.referralUnavailable"));
      return;
    }
    if (!isValidReferralCodePlain(newCode)) {
      showToast(t("affiliate.codeInvalid"));
      return;
    }
    try {
      const plain = newCode.trim();
      const hash = keccak256(toBytes(plain));
      await registerCode(hash);
      if (address) saveReferralCode(chainId, address, plain);
      setSavedPlainCode(plain);
      setNewCode("");
      showToast(t("affiliate.registerSuccess"));
    } catch {
      showToast(t("affiliate.registerFailed"));
    }
  };

  const handleRestoreCode = useCallback(() => {
    if (!referrerCodeHash || !restoreCode.trim()) return;
    if (!isValidReferralCodePlain(restoreCode)) {
      showToast(t("affiliate.codeInvalid"));
      return;
    }
    const hash = keccak256(toBytes(restoreCode.trim()));
    if (hash !== referrerCodeHash) {
      showToast(t("affiliate.codeMismatch"));
      return;
    }
    if (address) {
      saveReferralCode(chainId, address, restoreCode.trim());
      setSavedPlainCode(restoreCode.trim());
    }
    setRestoreCode("");
    showToast(t("affiliate.codeRestored"));
  }, [referrerCodeHash, restoreCode, address, chainId, showToast, t]);

  const referredLabel = isGuestDemo
    ? `${DEMO_AFFILIATE.referralCount} ${locale === "ja" ? "人" : "Users"}`
    : hasDeployment
      ? `${referralCount} ${locale === "ja" ? "人" : referralCount === 1 ? "User" : "Users"}`
      : "—";

  const commissionRate = isGuestDemo
    ? DEMO_AFFILIATE.commissionRate
    : registered || hasDeployment
      ? "15%"
      : "—";

  const commissionLabel = isGuestDemo
    ? DEMO_AFFILIATE.commissionUsdc
    : !isConnected
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

  const leaderboardRows = isGuestDemo ? DEMO_AFFILIATE_LEADERBOARD : (refLeaderboard ?? []);

  const showLinkSection = isGuestDemo || (isConnected && registered && plainCode);
  const showRegisterSection =
    isConnected && !registered && !isGuestDemo && hasDeployment && hasReferralRegistry && isOnAppChain;
  const showRestoreSection = isConnected && registered && !plainCode && !isGuestDemo;
  const showConnectToCreate = isGuestDemo || (!isConnected && hasReferralRegistry);

  return (
    <MainCard className="max-w-lg">
      <h2 className="text-lg font-semibold text-white mb-1">{t("affiliate.title")}</h2>
      <p className="text-xs text-zinc-500 mb-4">{t("affiliate.subtitle")}</p>

      {hasRefereeBoost && !isGuestDemo && (
        <p className="text-xs text-cyan-400/90 mb-4 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          {t("affiliate.boostActive")}
        </p>
      )}

      {showConnectToCreate && (
        <div className="mb-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <label className="text-sm text-zinc-300 block mb-1">{t("affiliate.createCode")}</label>
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
          <label className="text-sm text-zinc-300 block mb-1">{t("affiliate.createCode")}</label>
          <p className="text-xs text-zinc-500 mb-2">{t("affiliate.createCodeHint")}</p>
          <div className="flex gap-2">
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="MYCODE"
              maxLength={16}
              className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono outline-none focus:border-cyan-500/50"
            />
            <button
              type="button"
              onClick={handleRegisterCode}
              disabled={registerPending}
              className="px-4 py-2 rounded-xl gradient-btn text-sm font-semibold disabled:opacity-50 shrink-0"
            >
              {registerPending ? "…" : t("affiliate.registerCode")}
            </button>
          </div>
        </div>
      )}

      {showRestoreSection && (
        <div className="mb-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <label className="text-sm text-zinc-300 block mb-1">{t("affiliate.restoreCode")}</label>
          <p className="text-xs text-zinc-500 mb-2">{t("affiliate.restoreCodeHint")}</p>
          <div className="flex gap-2">
            <input
              value={restoreCode}
              onChange={(e) => setRestoreCode(e.target.value.toUpperCase())}
              placeholder="MYCODE"
              maxLength={16}
              className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono outline-none focus:border-cyan-500/50"
            />
            <button
              type="button"
              onClick={handleRestoreCode}
              className="px-4 py-2 rounded-xl bg-zinc-700 border border-zinc-600 text-sm text-white hover:border-cyan-500/50 shrink-0"
            >
              {t("affiliate.restoreCode")}
            </button>
          </div>
        </div>
      )}

      {!isGuestDemo && !isConnected && !showConnectToCreate && (
        <p className="text-xs text-zinc-500 mb-4">{t("affiliate.connectForLink")}</p>
      )}

      {!hasReferralRegistry && !isGuestDemo && (
        <p className="text-xs text-amber-500/90 mb-4 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          {t("affiliate.referralUnavailable")}
        </p>
      )}

      {showLinkSection && (
        <>
          <p className="text-xs text-zinc-400 mb-2">
            {isGuestDemo ? t("affiliate.demoLinkLabel") : t("affiliate.yourLink")}
          </p>
          <div className="flex gap-2 mb-3">
            <input
              readOnly
              value={refUrl}
              className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono"
            />
            <button
              onClick={copy}
              className="px-3 py-2 rounded-xl bg-zinc-700 border border-zinc-600 hover:border-cyan-500/50 flex items-center gap-1 text-sm text-white"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>

          <button
            type="button"
            onClick={shareOnX}
            className="w-full flex items-center justify-center gap-2 py-2.5 mb-6 rounded-xl border border-zinc-700 text-sm text-zinc-300 hover:border-cyan-500/40 hover:text-white transition-colors"
          >
            <Share2 className="w-4 h-4" />
            {t("affiliate.shareX")}
          </button>
        </>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
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

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: t("affiliate.totalReferred"), value: referredLabel },
          { label: t("affiliate.commissionRate"), value: commissionRate },
          { label: t("affiliate.totalCommissions"), value: commissionLabel },
        ].map((s) => (
          <div key={s.label} className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-center">
            <p className="text-[10px] text-zinc-500">{s.label}</p>
            <p className="text-sm font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {claimableViaCashdrop && !isGuestDemo && (
        <p className="text-[10px] text-emerald-400/90 mb-2">
          <Link href={tabPath("cashdrop")} className="underline hover:text-emerald-300">
            {t("affiliate.claimViaCashdrop")}
          </Link>
          {commissionUsdc ? ` (${commissionUsdc} USDC)` : null}
        </p>
      )}

      <p className="text-[10px] text-zinc-600 mb-2 leading-relaxed">{t("affiliate.commissionNote")}</p>
      <p className="text-[10px] text-amber-500/80 mb-6 leading-relaxed">{t("affiliate.normalizeNote")}</p>

      <div className="mb-6 pt-4 border-t border-zinc-800">
        <label className="text-sm text-zinc-300 block mb-1">{t("affiliate.haveCode")}</label>
        <p className="text-xs text-zinc-500 mb-2">{t("affiliate.codeHint")}</p>
        <div className="flex gap-2">
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="XM79B4"
            maxLength={16}
            className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono outline-none focus:border-cyan-500/50"
          />
          <button
            type="button"
            onClick={applyCode}
            disabled={enterPending || (isConnected && !isOnAppChain)}
            className="px-4 py-2 rounded-xl gradient-btn text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            {enterPending ? "…" : t("common.apply")}
          </button>
        </div>
      </div>

      <h3 className="text-sm font-medium text-zinc-300 mb-1">{t("affiliate.leaderboard")}</h3>
      <p className="text-[10px] text-zinc-600 mb-3">{t("affiliate.leaderboardSub")}</p>
      <div className="rounded-xl border border-zinc-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/80 text-zinc-500 text-xs">
            <tr>
              <th className="py-2 px-3 text-left">{t("affiliate.rank")}</th>
              <th className="py-2 px-3 text-left">{t("affiliate.wallet")}</th>
              <th className="py-2 px-3 text-right">{t("affiliate.referrals")}</th>
            </tr>
          </thead>
          <tbody>
            {refLbLoading && !isGuestDemo ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  {t("common.loading")}
                </td>
              </tr>
            ) : !leaderboardRows.length ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-zinc-500 text-xs">
                  {hasDeployment ? t("affiliate.leaderboardEmpty") : t("affiliate.leaderboardDemo")}
                </td>
              </tr>
            ) : (
              leaderboardRows.map((row) => (
                <tr key={row.rank} className="border-t border-zinc-800">
                  <td className="py-2 px-3 text-zinc-500">#{row.rank}</td>
                  <td className="py-2 px-3 font-mono text-zinc-300">{row.address}</td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-medium">
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
