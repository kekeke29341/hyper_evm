"use client";

import { useState } from "react";
import Link from "next/link";
import { Shield, LayoutDashboard, Droplets, Star, Gift, BarChart3, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/hooks/useAdmin";
import { useApp } from "@/lib/store";
import { WalletModal } from "@/components/layout/WalletModal";
import { Toast } from "@/components/ui/shared";
import { AnalyticsPanel } from "./panels/AnalyticsPanel";
import { PoolsPanel } from "./panels/PoolsPanel";
import { PointsPanel } from "./panels/PointsPanel";
import { AirdropPanel } from "./panels/AirdropPanel";

const ADMIN_TABS = [
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "pools", label: "Pools", icon: Droplets },
  { id: "points", label: "Points", icon: Star },
  { id: "airdrop", label: "Airdrop", icon: Gift },
] as const;

type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

export function AdminShell() {
  const [tab, setTab] = useState<AdminTabId>("analytics");
  const { isConnected, isAdmin, address, isPointsOwner, isAirdropOwner, isFactoryAdmin } = useAdminAuth();
  const { openWalletModal } = useApp();

  const roleBadges = [
    isPointsOwner ? "Points Owner" : null,
    isAirdropOwner ? "Airdrop Owner" : null,
    isFactoryAdmin ? "Factory Admin" : null,
  ].filter((b): b is string => b !== null);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white shrink-0">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">App</span>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <Shield className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-white">Admin Dashboard</span>
          </div>

          <nav className="flex-1 overflow-x-auto flex gap-1 min-w-0">
            {ADMIN_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm whitespace-nowrap rounded-md transition-colors",
                    tab === t.id
                      ? "text-white bg-zinc-800/80 border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={openWalletModal}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0",
              isConnected ? "bg-zinc-800 border border-zinc-700 text-zinc-300" : "gradient-btn"
            )}
          >
            {isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect"}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {!isConnected ? (
          <div className="card-glass rounded-2xl p-8 text-center border border-zinc-800">
            <LayoutDashboard className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-white mb-2">Connect Owner Wallet</h1>
            <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
              Admin actions require the deployer wallet on local Anvil (account #0) or contract owners on testnet.
            </p>
            <button type="button" onClick={openWalletModal} className="gradient-btn px-6 py-2.5 rounded-xl text-sm font-semibold">
              Connect Wallet
            </button>
          </div>
        ) : !isAdmin ? (
          <div className="card-glass rounded-2xl p-8 text-center border border-amber-900/40">
            <Shield className="w-12 h-12 text-amber-500/60 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-white mb-2">Access Denied</h1>
            <p className="text-sm text-zinc-500 mb-2">
              Connected wallet is not a contract owner or factory admin.
            </p>
            <p className="text-xs text-zinc-600 font-mono">{address}</p>
            <p className="text-xs text-zinc-500 mt-4">
              Local dev: import Anvil account #0 private key in MetaMask.
            </p>
          </div>
        ) : (
          <>
            {roleBadges.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {roleBadges.map((b) => (
                  <span
                    key={b}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  >
                    {b}
                  </span>
                ))}
              </div>
            )}
            {tab === "analytics" && <AnalyticsPanel />}
            {tab === "pools" && <PoolsPanel />}
            {tab === "points" && <PointsPanel />}
            {tab === "airdrop" && <AirdropPanel />}
          </>
        )}
      </main>

      <footer className="py-4 text-center text-xs text-zinc-600 border-t border-zinc-800/50">
        Project X Admin — on-chain owner-gated operations only
      </footer>

      <WalletModal />
      <Toast />
    </div>
  );
}
