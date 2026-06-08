"use client";

import { useState } from "react";
import { keccak256, toBytes } from "viem";
import { Gift } from "lucide-react";
import { MainCard, PrimaryButton } from "@/components/ui/shared";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useDeployment, useTokenBalance, useLpBalance, useEnterInvitationCode } from "@/lib/hooks/useDeFi";

export function PortfolioTab() {
  const { isConnected, showToast, openWalletModal } = useApp();
  const { t } = useI18n();
  const deployment = useDeployment();
  const [inviteCode, setInviteCode] = useState("");
  const khype = useTokenBalance("kHYPE");
  const usdc = useTokenBalance("USDC");
  const { balance: lpBalance, hasPosition } = useLpBalance();
  const { enterCode, isPending } = useEnterInvitationCode();

  const khypeVal = parseFloat(khype.balance) * 0.42;
  const usdcVal = parseFloat(usdc.balance);
  const lpVal = hasPosition ? parseFloat(lpBalance) * 0.5 : 0;
  const total =
    isConnected && deployment ? (khypeVal + usdcVal + lpVal).toFixed(2) : "0.00";

  const rawTotal = khypeVal + usdcVal + lpVal || 1;
  const khypePct = Math.round((khypeVal / rawTotal) * 100) || 0;
  const usdcPct = Math.round((usdcVal / rawTotal) * 100) || 0;
  const lpPct = Math.max(0, 100 - khypePct - usdcPct);

  const applyCode = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!deployment || !inviteCode.trim()) return;
    try {
      const code = keccak256(toBytes(inviteCode.trim()));
      await enterCode(code);
      showToast(t("portfolio.inviteSuccess"));
    } catch {
      showToast(t("portfolio.inviteFailed"));
    }
  };

  const assets = [
    { name: "kHYPE", pct: isConnected ? khypePct : 45, color: "bg-emerald-500", bal: khype.balance },
    { name: "USDC", pct: isConnected ? usdcPct : 35, color: "bg-blue-500", bal: usdc.balance },
    { name: "LP Tokens", pct: isConnected ? lpPct : 20, color: "bg-violet-500", bal: hasPosition ? lpBalance : "—" },
  ];

  return (
    <MainCard>
      <h2 className="text-lg font-semibold text-white mb-1">{t("portfolio.title")}</h2>
      {!isConnected && (
        <p className="text-xs text-zinc-500 mb-2">{t("portfolio.connectHint")}</p>
      )}
      <p className="text-3xl font-bold text-white mt-4">
        {t("portfolio.totalBalance")}: <span className="neon-text-cyan">${total}</span>
      </p>

      <div className="mt-6">
        <h3 className="text-sm text-zinc-400 mb-3">{t("portfolio.assetAllocation")}</h3>
        <div className="h-3 rounded-full overflow-hidden flex bg-zinc-800">
          {assets.map((a) => (
            <div key={a.name} className={a.color} style={{ width: `${a.pct}%` }} />
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {assets.map((a) => (
            <div key={a.name} className="flex justify-between text-sm">
              <span className="flex items-center gap-2 text-zinc-300">
                <span className={`w-2 h-2 rounded-full ${a.color}`} />
                {a.name}
              </span>
              <span className="text-zinc-500">
                {a.bal} {a.name !== "LP Tokens" ? a.name : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-zinc-800">
        <div className="flex items-start gap-2 mb-3">
          <Gift className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
          <div>
            <label className="text-sm text-zinc-300 block">{t("portfolio.inviteCode")}</label>
            <p className="text-xs text-zinc-500 mt-0.5">{t("portfolio.inviteBoost")}</p>
          </div>
        </div>
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="XM79B4"
          className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-cyan-500/50"
        />
        <div className="mt-3">
          <PrimaryButton onClick={applyCode} disabled={isPending}>
            {isPending ? t("common.applying") : t("portfolio.applyCode")}
          </PrimaryButton>
        </div>
      </div>
    </MainCard>
  );
}
