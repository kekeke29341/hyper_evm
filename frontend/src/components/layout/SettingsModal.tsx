"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/lib/store";

const SLIPPAGE_KEY = "prjx_slippage_bps";

export function getSlippageBps(): number {
  if (typeof window === "undefined") return 50;
  const v = localStorage.getItem(SLIPPAGE_KEY);
  return v ? Number(v) : 50;
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useApp();
  const [slippage, setSlippage] = useState(getSlippageBps);

  const saveSlippage = (bps: number) => {
    setSlippage(bps);
    localStorage.setItem(SLIPPAGE_KEY, String(bps));
    showToast(`Slippage set to ${bps / 100}%`);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm card-glass rounded-2xl p-5 border border-zinc-800"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Settings</h2>
              <button type="button" onClick={onClose} className="p-1 text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-zinc-500 mb-2">Default slippage tolerance</p>
                <div className="flex gap-2">
                  {[30, 50, 100].map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      onClick={() => saveSlippage(bps)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        slippage === bps
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {bps / 100}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2">Admin</p>
                <Link
                  href="/admin"
                  onClick={onClose}
                  className="text-sm text-amber-400 hover:text-amber-300"
                >
                  Open Admin Dashboard →
                </Link>
              </div>

              <p className="text-[10px] text-zinc-600">
                Project X · HyperEVM DEX · Phase 2 Live
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
