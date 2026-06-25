"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, ChevronRight } from "lucide-react";
import { PROJECT_X_POOL, MANAGED_LP_RANGE } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { useTokenBalance } from "@/lib/hooks/useDeFi";
import {
  formatUsd,
  poolPriceUsdcPerKhype,
  managedRangeBounds,
} from "@/lib/liquidity/metrics";
import { cn } from "@/lib/utils";

type FundingSource = "wallet-khype" | "wallet-usdc" | "vault";

export function CreatePositionModal({
  open,
  onClose,
  reserveKhype,
  reserveUsdc,
  onConfirmZap,
  isPending,
  mode = "create",
}: {
  open: boolean;
  onClose: () => void;
  reserveKhype: number;
  reserveUsdc: number;
  onConfirmZap: (source: "kHYPE" | "USDC", amount: string, rangePct: number) => Promise<void>;
  isPending: boolean;
  mode?: "create" | "add";
}) {
  const { t } = useI18n();
  const khypeBal = useTokenBalance("kHYPE");
  const usdcBal = useTokenBalance("USDC");

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [funding, setFunding] = useState<FundingSource>("wallet-usdc");
  const [amount, setAmount] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const price = poolPriceUsdcPerKhype(reserveKhype, reserveUsdc);
  const bounds = managedRangeBounds(price);

  const sourceToken: "kHYPE" | "USDC" = funding === "wallet-khype" ? "kHYPE" : "USDC";
  const balance = funding === "wallet-khype" ? khypeBal.balance : usdcBal.balance;
  const amountNum = parseFloat(amount) || 0;

  const canSubmit = funding !== "vault" && amountNum > 0 && amountNum <= parseFloat(balance || "0");

  const reset = () => {
    setStep("form");
    setAmount("");
    setFunding("wallet-usdc");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirm = async () => {
    await onConfirmZap(sourceToken, amount, bounds.widthPct);
    reset();
    onClose();
  };

  const fundingOptions: { id: FundingSource; label: string; disabled?: boolean }[] = [
    { id: "wallet-khype", label: t("position.walletKhype") },
    { id: "wallet-usdc", label: t("position.walletUsdc") },
    { id: "vault", label: t("position.vaultBalance"), disabled: true },
  ];

  const pctButtons = [25, 50, 75, 100] as const;

  const applyPct = (pct: number) => {
    // MAX must use the exact balance string — float math (bal*100/100) can round up past the
    // real on-chain balance and make the deposit revert on transferFrom.
    if (pct === 100) {
      setAmount(balance || "0");
      return;
    }
    const bal = parseFloat(balance || "0");
    if (!bal) return;
    setAmount(String((bal * pct) / 100));
  };

  return (
    mounted
      ? createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={handleClose}
                />
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 24 }}
                  className="relative z-10 w-full sm:max-w-lg card-glass rounded-t-2xl sm:rounded-2xl border border-zinc-800 max-h-[min(92dvh,92vh)] flex flex-col safe-bottom"
                  role="dialog"
                  aria-modal="true"
                >
                  <div className="shrink-0 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between rounded-t-2xl sm:rounded-t-2xl">
                    <h2 className="text-lg font-semibold text-white">
                      {mode === "add" ? t("position.addLiquidity") : t("position.createPosition")}
                    </h2>
                    <button type="button" onClick={handleClose} className="p-1 text-zinc-500 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto overscroll-contain">
                    {step === "form" ? (
                      <div className="p-4 space-y-5 pb-6">
                <section>
                  <p className="text-xs text-zinc-500 mb-2">{t("position.poolSelect")}</p>
                  <div className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10">
                    <p className="font-medium text-white text-sm">
                      {PROJECT_X_POOL.pair}{" "}
                      <span className="text-zinc-500">{PROJECT_X_POOL.feeTier}</span>
                    </p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <p className="text-zinc-500">{t("position.apy")}</p>
                        <p className="text-emerald-400 font-semibold">{PROJECT_X_POOL.referenceApr}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500">{t("position.tvl")}</p>
                        <p className="text-zinc-300">{PROJECT_X_POOL.tvl}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500">{t("position.volume24h")}</p>
                        <p className="text-zinc-300">{PROJECT_X_POOL.volume24h}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-zinc-600">{t("position.feeSplitFootnote")}</p>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    HYPE/USDC {t("position.currentPrice")}:{" "}
                    <span className="text-zinc-300 tabular-nums">{Math.round(price).toLocaleString()}</span>
                  </p>
                </section>

                <section>
                  <p className="text-xs text-zinc-500 mb-2">{t("position.fundingSource")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {fundingOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => setFunding(opt.id)}
                        className={cn(
                          "py-2 px-2 text-xs rounded-lg border transition-colors",
                          funding === opt.id
                            ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                            : "border-zinc-700 text-zinc-400",
                          opt.disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <p className="text-xs text-zinc-500 mb-2">{t("position.investmentAmount")}</p>
                  <div className="bg-zinc-800/40 rounded-xl p-3 border border-zinc-700">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-full bg-transparent text-2xl font-light text-white outline-none"
                    />
                    <div className="flex gap-1 mt-2">
                      {pctButtons.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => applyPct(p)}
                          className="flex-1 py-1 text-[10px] rounded-md border border-zinc-600 text-zinc-400 hover:border-cyan-500/40"
                        >
                          {p === 100 ? "MAX" : `${p}%`}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      ≈ {formatUsd(sourceToken === "USDC" ? amountNum : amountNum * price)} ·{" "}
                      {t("common.balance")}: {balance} {sourceToken}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    {t("position.zapHint")} {t("position.rangeV2Note")}
                  </p>
                </section>

                <section>
                  <p className="text-xs text-zinc-500 mb-2">{t("position.rangeWidth")}</p>
                  <p className="text-sm text-cyan-400 font-medium">{MANAGED_LP_RANGE.label}</p>
                  <p className="mt-2 text-[10px] text-zinc-500">{t("position.managedRangeFixed")}</p>
                  <p className="mt-1 text-[10px] text-zinc-500">{t("position.rangeV2Note")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <p className="text-zinc-500">{t("position.lower")}</p>
                      <p className="text-white tabular-nums">{bounds.lower.toLocaleString()}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <p className="text-zinc-500">{t("position.upper")}</p>
                      <p className="text-white tabular-nums">{bounds.upper.toLocaleString()}</p>
                    </div>
                  </div>
                </section>

                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => setStep("confirm")}
                  className="w-full py-3 rounded-xl gradient-btn text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {t("position.toConfirm")} <ChevronRight className="w-4 h-4" />
                </button>
                      </div>
                    ) : (
                      <div className="p-4 space-y-4 pb-6">
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2 text-sm">
                  <p className="text-white font-medium">{PROJECT_X_POOL.pair}</p>
                  <p className="text-zinc-400">
                    {amount} {sourceToken === "kHYPE" ? "HYPE" : sourceToken} → Vault
                  </p>
                  <p className="text-zinc-500 text-xs">
                    {t("position.rangeWidth")}: {MANAGED_LP_RANGE.label} ({bounds.lower} – {bounds.upper})
                  </p>
                  <p className="text-[10px] text-zinc-500">{t("position.feeSplitFootnote")}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("form")}
                    className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm"
                  >
                    {t("position.back")}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleConfirm}
                    className="flex-1 py-3 rounded-xl gradient-btn text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> {t("position.confirming")}
                      </>
                    ) : (
                      t("position.confirmCreate")
                    )}
                  </button>
                </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null
  );
}
