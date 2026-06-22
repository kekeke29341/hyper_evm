"use client";

import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { useGuestDemo } from "@/lib/hooks/useGuestDemo";
import { useI18n } from "@/lib/i18n";

export function DemoModeBanner() {
  const { isGuestDemo } = useGuestDemo();
  const { openWalletModal } = useApp();
  const { t } = useI18n();

  if (!isGuestDemo) return null;

  return (
    <div className="max-w-6xl mx-auto mb-4 px-1">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10">
        <div className="flex items-start sm:items-center gap-2 text-xs text-violet-100/90 leading-relaxed">
          <Sparkles className="w-4 h-4 shrink-0 text-violet-300 mt-0.5 sm:mt-0" />
          <span>{t("demo.banner")}</span>
        </div>
        <button
          type="button"
          onClick={openWalletModal}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/20 border border-violet-400/40 text-violet-200 hover:bg-violet-500/30 transition-colors"
        >
          {t("demo.connectForReal")}
        </button>
      </div>
    </div>
  );
}
