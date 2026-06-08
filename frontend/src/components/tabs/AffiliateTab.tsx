"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { keccak256, toBytes } from "viem";
import { AFFILIATE_LEADERBOARD } from "@/lib/constants";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useDeployment, useEnterInvitationCode } from "@/lib/hooks/useDeFi";
import { MainCard } from "@/components/ui/shared";

export function AffiliateTab() {
  const { showToast, isConnected, openWalletModal } = useApp();
  const { t, locale } = useI18n();
  const deployment = useDeployment();
  const [copied, setCopied] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const { enterCode, isPending } = useEnterInvitationCode();
  const refUrl = "https://www.prjx.com/ref?code=XM79B4";

  const copy = async () => {
    await navigator.clipboard.writeText(refUrl);
    setCopied(true);
    showToast(t("common.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnX = () => {
    const text =
      locale === "ja"
        ? encodeURIComponent("Project X — 手数料0%のHyperEVM DEX。私のリンクから参加:")
        : encodeURIComponent(
            "Trade on Project X — HyperEVM's community DEX with 0% fees. Join via my link:"
          );
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(refUrl)}`, "_blank");
  };

  const applyCode = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!deployment || !inviteCode.trim()) return;
    try {
      const code = keccak256(toBytes(inviteCode.trim()));
      await enterCode(code);
      showToast(t("affiliate.applySuccess"));
    } catch {
      showToast(t("portfolio.inviteFailed"));
    }
  };

  return (
    <MainCard className="max-w-lg">
      <h2 className="text-lg font-semibold text-white mb-1">{t("affiliate.title")}</h2>
      <p className="text-xs text-zinc-500 mb-4">{t("affiliate.subtitle")}</p>

      <p className="text-xs text-zinc-400 mb-2">{t("affiliate.yourLink")}</p>
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

      <div className="grid grid-cols-3 gap-2 mb-6">
        {[
          { label: t("affiliate.totalReferred"), value: "42 Users" },
          { label: t("affiliate.commissionRate"), value: "15% Tier 2" },
          { label: t("affiliate.totalCommissions"), value: "450 USDC" },
        ].map((s) => (
          <div key={s.label} className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-center">
            <p className="text-[10px] text-zinc-500">{s.label}</p>
            <p className="text-sm font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 pt-4 border-t border-zinc-800">
        <label className="text-sm text-zinc-300 block mb-1">{t("affiliate.haveCode")}</label>
        <p className="text-xs text-zinc-500 mb-2">{t("affiliate.codeHint")}</p>
        <div className="flex gap-2">
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="XM79B4"
            className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-cyan-500/50"
          />
          <button
            type="button"
            onClick={applyCode}
            disabled={isPending}
            className="px-4 py-2 rounded-xl gradient-btn text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            {isPending ? "…" : t("common.apply")}
          </button>
        </div>
      </div>

      <h3 className="text-sm font-medium text-zinc-300 mb-3">{t("affiliate.leaderboard")}</h3>
      <div className="rounded-xl border border-zinc-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/80 text-zinc-500 text-xs">
            <tr>
              <th className="py-2 px-3 text-left">{t("affiliate.rank")}</th>
              <th className="py-2 px-3 text-left">{t("affiliate.wallet")}</th>
              <th className="py-2 px-3 text-right">{t("affiliate.reward")}</th>
            </tr>
          </thead>
          <tbody>
            {AFFILIATE_LEADERBOARD.map((row) => (
              <tr key={row.rank} className="border-t border-zinc-800">
                <td className="py-2 px-3 text-zinc-500">#{row.rank}</td>
                <td className="py-2 px-3 font-mono text-zinc-300">{row.address}</td>
                <td className="py-2 px-3 text-right text-emerald-400 font-medium">{row.reward}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainCard>
  );
}
