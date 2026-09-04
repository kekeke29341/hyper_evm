"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { usePoolContext } from "@/lib/pools/PoolContext";
import {
  usePoolDeposit,
  usePoolTokenBalance,
  useWrapNativeHype,
  type PoolDepositSide,
} from "@/lib/hooks/usePoolVault";
import { displayBaseSymbol, displayQuoteSymbol } from "@/lib/pools/format";
import { cn } from "@/lib/utils";

export function PoolDepositModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { pool } = usePoolContext();
  const quoteSym = displayQuoteSymbol(pool);
  const baseSym = displayBaseSymbol(pool);

  const quoteBal = usePoolTokenBalance(pool.quoteToken, pool.quoteDecimals);
  const baseBal = usePoolTokenBalance(pool.baseToken, pool.baseDecimals);
  const { deposit, isPending } = usePoolDeposit();
  const { wrap, isPending: wrapping } = useWrapNativeHype();

  const [mounted, setMounted] = useState(false);
  const [side, setSide] = useState<PoolDepositSide>("quote");
  const [amount, setAmount] = useState("");
  const [wrapAmount, setWrapAmount] = useState("0.01");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setAmount("");
      setSide("quote");
    }
  }, [open]);

  const balance = side === "quote" ? quoteBal.formatted : baseBal.formatted;
  const balanceNum = parseFloat(balance) || 0;
  const amountNum = parseFloat(amount) || 0;
  const canSubmit = amountNum > 0 && amountNum <= balanceNum;

  const handleDeposit = async () => {
    await deposit(side, amount);
    onSuccess?.();
    onClose();
  };

  const handleWrap = async () => {
    await wrap(wrapAmount);
    quoteBal.refetch();
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Deposit to {pool.label}</h3>
              <button type="button" onClick={onClose} className="p-1 text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-1 mb-4">
              {(["quote", "base"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={cn(
                    "flex-1 py-2 text-xs rounded-lg border transition-colors",
                    side === s
                      ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                      : "border-zinc-700 text-zinc-500"
                  )}
                >
                  {s === "quote" ? quoteSym : baseSym}
                </button>
              ))}
            </div>

            <p className="text-xs text-zinc-500 mb-2">
              Wallet balance: {balance} {side === "quote" ? quoteSym : baseSym}
            </p>

            {side === "quote" && balanceNum < 0.001 && (
              <div className="mb-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-100">
                <p className="mb-2">Need WHYPE? Wrap native HYPE first:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={wrapAmount}
                    onChange={(e) => setWrapAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white"
                  />
                  <button
                    type="button"
                    disabled={wrapping}
                    onClick={handleWrap}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold"
                  >
                    {wrapping ? "…" : "Wrap"}
                  </button>
                </div>
              </div>
            )}

            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="Amount"
              className="w-full px-3 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm outline-none focus:border-violet-500/50 mb-2"
            />
            <button
              type="button"
              onClick={() => setAmount(balance)}
              className="text-[10px] text-violet-400 hover:text-violet-300 mb-4"
            >
              MAX
            </button>

            <button
              type="button"
              disabled={!canSubmit || isPending}
              onClick={handleDeposit}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2",
                canSubmit && !isPending ? "gradient-btn" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Deposit {side === "quote" ? quoteSym : baseSym}
            </button>

            <p className="text-[10px] text-zinc-600 mt-3 text-center">
              Single-sided deposit swaps ~50% into the other token and mints LP in a ±5% range.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
