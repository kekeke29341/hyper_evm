"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Shield, Settings } from "lucide-react";
import { TAB_IDS, type TabId } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { ADMIN_ENABLED } from "@/lib/config";
import { NetworkSelector } from "@/components/layout/NetworkSelector";
import { SettingsModal } from "@/components/layout/SettingsModal";

export function Header({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
}) {
  const { displayAddress, isConnected, openWalletModal } = useApp();
  const { locale, setLocale, t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
            <span className="text-sm font-black text-zinc-950 leading-none">H</span>
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-white leading-none">Hyperpool</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">{t("header.tagline")}</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {t("header.phase2")}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700 flex items-center gap-1">
            <Lock className="w-3 h-3" /> {t("header.phase3")}
          </span>
        </div>

        <nav className="flex-1 overflow-x-auto scrollbar-thin flex gap-0.5 min-w-0" aria-label="Main navigation">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md transition-colors",
                activeTab === id
                  ? "text-white bg-zinc-800/80 border-b-2 border-cyan-400"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden sm:flex rounded-lg border border-zinc-800 overflow-hidden text-[10px]">
            <button
              type="button"
              onClick={() => setLocale("ja")}
              className={cn(
                "px-2 py-1 transition-colors",
                locale === "ja" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              JA
            </button>
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={cn(
                "px-2 py-1 transition-colors",
                locale === "en" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              EN
            </button>
          </div>

          <div className="hidden sm:block">
            <NetworkSelector />
          </div>

          {ADMIN_ENABLED && (
            <Link
              href="/admin"
              title="Admin Dashboard"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors"
            >
              <Shield className="w-4 h-4" />
            </Link>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={openWalletModal}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg font-semibold transition-all",
              isConnected
                ? "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-cyan-500/40"
                : "gradient-btn"
            )}
          >
            {isConnected ? displayAddress : t("header.connectWallet")}
          </button>
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="mt-auto py-8 px-4 text-center border-t border-zinc-800/50">
      <p className="max-w-lg mx-auto text-xs text-zinc-500 leading-relaxed">{t("footer.motto")}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-zinc-600">
        <span>{t("footer.dex")}</span>
        <span aria-hidden>·</span>
        <span>{t("footer.fees")}</span>
        <span aria-hidden>·</span>
        <span>{t("footer.powered")}</span>
      </div>
    </footer>
  );
}
