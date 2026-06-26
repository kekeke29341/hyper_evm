"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  LayoutDashboard,
  Droplets,
  Gift,
  BarChart3,
  ArrowLeft,
  Vault,
  Settings,
  Home,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/hooks/useAdmin";
import { useApp } from "@/lib/store";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { getChainDeploymentMeta } from "@/lib/contracts";
import { AdminActionsProvider } from "@/lib/admin/AdminActionsContext";
import { WalletModal } from "@/components/layout/WalletModal";
import { Toast } from "@/components/ui/shared";
import { AdminNetworkBanner } from "./AdminNetworkBanner";
import { AdminTxBanner } from "./AdminTxBanner";
import { OverviewPanel } from "./panels/OverviewPanel";
import { AnalyticsPanel } from "./panels/AnalyticsPanel";
import { PoolsPanel } from "./panels/PoolsPanel";
import { RewardsPanel } from "./panels/RewardsPanel";
import { AirdropPanel } from "./panels/AirdropPanel";
import { VaultPanel } from "./panels/VaultPanel";
import { SystemPanel } from "./panels/SystemPanel";

const ADMIN_TABS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "pools", label: "Pool", icon: Droplets },
  { id: "rewards", label: "Rewards", icon: Coins },
  { id: "airdrop", label: "Airdrop", icon: Gift },
  { id: "vault", label: "Vault", icon: Vault },
  { id: "system", label: "System", icon: Settings },
] as const;

export type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

export function AdminShell() {
  const [tab, setTab] = useState<AdminTabId>("overview");
  const chainId = useEffectiveChainId();
  const chainMeta = getChainDeploymentMeta(chainId);
  const { isConnected, isAdmin, address, isAirdropOwner, isVaultOwner } = useAdminAuth();
  const { openWalletModal } = useApp();

  const roleBadges = [
    isAirdropOwner ? "Airdrop Owner" : null,
    isVaultOwner ? "Vault Owner" : null,
  ].filter((b): b is string => b !== null);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md safe-top">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 md:py-3">
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white shrink-0">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">App</span>
            </Link>

            <div className="flex items-center gap-2 shrink-0 min-w-0">
              <Shield className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="font-bold text-white text-sm sm:text-base truncate">Admin</span>
            </div>

            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0 hidden md:inline">
              {chainMeta.label}
            </span>

            <nav
              className="hidden md:flex flex-1 overflow-x-auto flex gap-1 min-w-0 scrollbar-thin"
              aria-label="Admin navigation"
            >
              {ADMIN_TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md transition-colors shrink-0",
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
                "text-xs px-2.5 sm:px-3 py-1.5 rounded-lg font-semibold shrink-0 ml-auto md:ml-0 min-h-[36px]",
                isConnected ? "bg-zinc-800 border border-zinc-700 text-zinc-300" : "gradient-btn"
              )}
            >
              {isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect"}
            </button>
          </div>

          <nav
            className="md:hidden flex gap-1 mt-2 -mx-1 px-1 overflow-x-auto scrollbar-thin snap-x snap-mandatory scroll-px-2"
            aria-label="Admin navigation"
          >
            {ADMIN_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap rounded-md transition-colors shrink-0 min-h-[44px] snap-start",
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
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-4 py-6 overflow-x-hidden">
        <AdminActionsProvider>
          <AdminNetworkBanner />
          <AdminTxBanner />

          {!isConnected ? (
            <div className="card-glass rounded-2xl p-8 text-center border border-zinc-800">
              <LayoutDashboard className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-white mb-2">Connect owner wallet</h1>
              <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
                Admin writes require a vault or airdrop owner wallet on {chainMeta.label} (chain {chainId}).
              </p>
              <button
                type="button"
                onClick={openWalletModal}
                className="gradient-btn px-6 py-2.5 rounded-xl text-sm font-semibold"
              >
                Connect Wallet
              </button>
              <p className="text-xs text-zinc-600 mt-6">
                See <code className="text-zinc-400">docs/admin-guide.md</code> for roles and runbooks.
              </p>
            </div>
          ) : !isAdmin ? (
            <div className="card-glass rounded-2xl p-8 text-center border border-amber-900/40">
              <Shield className="w-12 h-12 text-amber-500/60 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-white mb-2">Access denied</h1>
              <p className="text-sm text-zinc-500 mb-2">This wallet is not an on-chain admin for the deployment.</p>
              <p className="text-xs text-zinc-600 font-mono">{address}</p>
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
              {tab === "overview" && <OverviewPanel />}
              {tab === "analytics" && <AnalyticsPanel />}
              {tab === "pools" && <PoolsPanel />}
              {tab === "rewards" && <RewardsPanel />}
              {tab === "airdrop" && <AirdropPanel />}
              {tab === "vault" && <VaultPanel />}
              {tab === "system" && <SystemPanel />}
            </>
          )}
        </AdminActionsProvider>
      </main>

      <footer className="py-4 text-center text-xs text-zinc-600 border-t border-zinc-800/50">
        Hyperpool Admin — owner-gated on-chain ops ·{" "}
        <a
          href="https://github.com/kekeke29341/hyper_evm/blob/main/docs/admin-guide.md"
          className="text-zinc-500 hover:text-cyan-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          Admin guide
        </a>
      </footer>

      <WalletModal />
      <Toast />
    </div>
  );
}
