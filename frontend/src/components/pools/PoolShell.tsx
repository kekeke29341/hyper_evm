"use client";

import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { NetworkSelector } from "@/components/layout/NetworkSelector";
import { Toast } from "@/components/ui/shared";
import { WalletModal } from "@/components/layout/WalletModal";
import { cn } from "@/lib/utils";

export function PoolShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { displayAddress, isConnected, openWalletModal } = useApp();
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md safe-top">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/pools"
            className="p-2 -ml-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            aria-label="Back to pools"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-zinc-950" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white truncate">{title}</h1>
              {subtitle ? <p className="text-[10px] text-zinc-500 truncate">{subtitle}</p> : null}
            </div>
          </div>
          <NetworkSelector compact className="shrink-0" />
          <button
            type="button"
            onClick={openWalletModal}
            className={cn(
              "text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all shrink-0",
              isConnected
                ? "bg-zinc-800 border border-zinc-700 text-zinc-300"
                : "gradient-btn"
            )}
          >
            {isConnected ? displayAddress : t("header.connectShort")}
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-2 flex gap-3 text-[11px]">
          <Link href="/" className="text-zinc-500 hover:text-cyan-400 transition-colors">
            ← HYPE/USDC Vault
          </Link>
          <span className="text-zinc-700">|</span>
          <Link href="/pools" className="text-zinc-500 hover:text-violet-400 transition-colors">
            All HYPE pools
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">{children}</main>

      <footer className="py-6 px-4 text-center border-t border-zinc-800/50 text-[11px] text-zinc-600 safe-bottom">
        HYPE-quoted managed LP · separate from the main HYPE/USDC vault
      </footer>

      <Toast />
      <WalletModal />
    </div>
  );
}
