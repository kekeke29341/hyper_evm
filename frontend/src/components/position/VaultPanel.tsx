"use client";

import { useState } from "react";
import { Loader2, Vault, Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type VaultAsset = "kHYPE" | "USDC";

export function VaultPanel({
  khypeBalance,
  usdcBalance,
  hasVault,
  vaultShares,
  vaultValueUsd,
  vaultKhype,
  vaultUsdc,
  onDeposit,
  onWithdraw,
  withdrawing,
}: {
  khypeBalance: string;
  usdcBalance: string;
  hasVault: boolean;
  vaultShares: string;
  vaultValueUsd: number;
  vaultKhype: number;
  vaultUsdc: number;
  onDeposit: () => void;
  onWithdraw: (shares: string) => void;
  withdrawing: boolean;
}) {
  const { t } = useI18n();
  const [asset, setAsset] = useState<VaultAsset>("USDC");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [withdrawShares, setWithdrawShares] = useState("");

  return (
    <div className="card-glass rounded-2xl p-4 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{t("position.vaultBalance")}</h3>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1",
            hasVault
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-zinc-800 text-zinc-500 border-zinc-700"
          )}
        >
          <Vault className="w-3 h-3" /> {hasVault ? t("position.phase3Live") : t("position.phase3")}
        </span>
      </div>

      <div className="flex gap-1 mb-3">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 py-1.5 text-xs rounded-lg border transition-colors",
              mode === m
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                : "border-zinc-700 text-zinc-500"
            )}
          >
            {m === "deposit" ? t("position.deposit") : t("position.withdraw")}
          </button>
        ))}
      </div>

      <div className="flex gap-1 mb-3">
        {(["kHYPE", "USDC"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAsset(a)}
            className={cn(
              "flex-1 py-1.5 text-xs rounded-lg border transition-colors",
              asset === a
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-zinc-700 text-zinc-500"
            )}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-500 space-y-2">
        <div className="flex items-center gap-2 text-zinc-400">
          <Wallet className="w-4 h-4 shrink-0" />
          <span>
            {t("position.walletBalance")}:{" "}
            {asset === "kHYPE" ? `${khypeBalance} kHYPE` : `${usdcBalance} USDC`}
          </span>
        </div>
        {hasVault ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <p className="text-zinc-600">{t("position.vaultShares")}</p>
              <p className="text-white tabular-nums">{parseFloat(vaultShares).toFixed(4)}</p>
            </div>
            <div>
              <p className="text-zinc-600">{t("position.positionValue")}</p>
              <p className="text-cyan-400 tabular-nums">${vaultValueUsd.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-zinc-600">kHYPE</p>
              <p className="text-zinc-300 tabular-nums">{vaultKhype.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-zinc-600">USDC</p>
              <p className="text-zinc-300 tabular-nums">{vaultUsdc.toFixed(2)}</p>
            </div>
          </div>
        ) : (
          <p>{t("position.vaultPhase3Hint")}</p>
        )}
      </div>

      {mode === "withdraw" && hasVault && (
        <div className="mt-3">
          <input
            type="text"
            inputMode="decimal"
            value={withdrawShares}
            onChange={(e) => setWithdrawShares(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={t("position.sharesToWithdraw")}
            className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-cyan-500/50"
          />
          <button
            type="button"
            onClick={() => setWithdrawShares(vaultShares)}
            className="mt-1 text-[10px] text-cyan-400 hover:text-cyan-300"
          >
            MAX
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={!hasVault || withdrawing}
        onClick={() => {
          if (mode === "deposit") onDeposit();
          else onWithdraw(withdrawShares || vaultShares);
        }}
        className={cn(
          "mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2",
          hasVault
            ? "gradient-btn"
            : "border border-zinc-700 text-zinc-500 cursor-not-allowed"
        )}
      >
        {withdrawing && <Loader2 className="w-4 h-4 animate-spin" />}
        {mode === "deposit" ? t("position.deposit") : t("position.withdraw")}
      </button>
    </div>
  );
}
