"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, TrendingUp, Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useApp } from "@/lib/store";

const STORAGE_KEY = "prjx_onboarding_done";
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

const STEPS = [
  { icon: Zap, titleKey: "onboarding.step1.title", bodyKey: "onboarding.step1.body" },
  { icon: TrendingUp, titleKey: "onboarding.step2.title", bodyKey: "onboarding.step2.body" },
  { icon: Wallet, titleKey: "onboarding.step3.title", bodyKey: "onboarding.step3.body" },
] as const;

export function OnboardingModal() {
  const { t } = useI18n();
  const { openWalletModal } = useApp();
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (isMobile === null) return;
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, [isMobile]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
      openWalletModal();
    }
  };

  const current = STEPS[step];
  const Icon = current.icon;

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
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  className="relative z-10 w-full sm:max-w-md card-glass rounded-t-2xl sm:rounded-2xl p-6 max-h-[min(90dvh,90vh)] overflow-y-auto safe-bottom"
                  role="dialog"
                  aria-modal="true"
                >
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all ${
                      i === step ? "w-8 bg-cyan-400" : i < step ? "w-4 bg-emerald-500/60" : "w-4 bg-zinc-700"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={finish}
                className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800"
                aria-label={t("onboarding.skip")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center mb-5">
                  <Icon className="w-7 h-7 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white">{t(current.titleKey)}</h2>
                <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{t(current.bodyKey)}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={finish}
                className="flex-1 py-3 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
              >
                {t("onboarding.skip")}
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 py-3 rounded-xl gradient-btn text-sm font-semibold"
              >
                {step < STEPS.length - 1 ? t("onboarding.next") : t("onboarding.start")}
              </button>
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
