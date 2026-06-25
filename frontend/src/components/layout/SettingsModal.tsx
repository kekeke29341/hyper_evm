"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { NetworkSelector } from "@/components/layout/NetworkSelector";
import { cn } from "@/lib/utils";

const SLIPPAGE_KEY = "prjx_slippage_bps";

export function getSlippageBps(): number {
  if (typeof window === "undefined") return 50;
  const v = localStorage.getItem(SLIPPAGE_KEY);
  return v ? Number(v) : 50;
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useApp();
  const { locale, setLocale, t } = useI18n();
  const [slippage, setSlippage] = useState(getSlippageBps);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const saveSlippage = (bps: number) => {
    setSlippage(bps);
    localStorage.setItem(SLIPPAGE_KEY, String(bps));
    showToast(`Slippage set to ${bps / 100}%`);
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
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={onClose}
                />
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  className="relative z-10 w-full sm:max-w-sm card-glass rounded-t-2xl sm:rounded-2xl p-5 border border-zinc-800 max-h-[min(90dvh,90vh)] overflow-y-auto safe-bottom"
                  role="dialog"
                  aria-modal="true"
                >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{t("header.settings")}</h2>
              <button type="button" onClick={onClose} className="p-1 text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="sm:hidden">
                <p className="text-xs text-zinc-500 mb-2">{t("header.language")}</p>
                <div className="flex gap-2">
                  {(["ja", "en"] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLocale(lang)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors",
                        locale === lang
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      )}
                    >
                      {lang === "ja" ? t("header.langJa") : t("header.langEn")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:hidden">
                <p className="text-xs text-zinc-500 mb-2">{t("header.switchNetwork")}</p>
                <NetworkSelector />
              </div>

              <div>
                <p className="text-xs text-zinc-500 mb-2">{t("header.slippage")}</p>
                <div className="flex gap-2">
                  {[30, 50, 100].map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      onClick={() => saveSlippage(bps)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors",
                        slippage === bps
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      )}
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
                Hyperpool · Project X Managed LP · Mainnet Ready
              </p>
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
