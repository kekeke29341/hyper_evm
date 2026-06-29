"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { useWalletGate } from "@/lib/hooks/useWalletGate";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { WalletModal } from "@/components/layout/WalletModal";
import { Toast } from "@/components/ui/shared";

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { openWalletModal } = useApp();
  const { active, canViewApp, isConnected, isChecking, address, misconfigured } = useWalletGate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="min-h-screen cyber-bg" aria-hidden />;
  }

  if (!active) {
    return <>{children}</>;
  }

  if (misconfigured) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 cyber-bg">
        <div className="card-glass rounded-2xl p-8 text-center border border-amber-900/40 max-w-md w-full">
          <ShieldAlert className="w-12 h-12 text-amber-500/60 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">{t("walletGate.misconfiguredTitle")}</h1>
          <p className="text-sm text-zinc-500">{t("walletGate.misconfiguredBody")}</p>
        </div>
      </div>
    );
  }

  if (canViewApp) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col cyber-bg">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="card-glass rounded-2xl p-8 text-center border border-zinc-800 max-w-md w-full">
          <Lock className="w-12 h-12 text-cyan-500/70 mx-auto mb-4" />
          {!isConnected || isChecking ? (
            <>
              <h1 className="text-xl font-semibold text-white mb-2">{t("walletGate.connectTitle")}</h1>
              <p className="text-sm text-zinc-500 mb-6">{t("walletGate.connectBody")}</p>
              <button
                type="button"
                onClick={openWalletModal}
                disabled={isChecking}
                className="gradient-btn px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {isChecking ? t("walletGate.checking") : t("header.connectWallet")}
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-white mb-2">{t("walletGate.deniedTitle")}</h1>
              <p className="text-sm text-zinc-500 mb-4">{t("walletGate.deniedBody")}</p>
              {address && <p className="text-xs text-zinc-600 font-mono mb-6">{address}</p>}
              <button
                type="button"
                onClick={openWalletModal}
                className="text-sm text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
              >
                {t("walletGate.switchWallet")}
              </button>
            </>
          )}
        </div>
      </main>
      <WalletModal />
      <Toast />
    </div>
  );
}
