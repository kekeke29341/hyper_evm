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
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/hooks/useAdmin";
import { useApp } from "@/lib/store";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { getChainDeploymentMeta } from "@/lib/contracts";
import { AdminActionsProvider } from "@/lib/admin/AdminActionsContext";
import { AdminTabProvider } from "@/lib/admin/AdminTabContext";
import { WalletModal } from "@/components/layout/WalletModal";
import { Toast } from "@/components/ui/shared";
import { AdminNetworkBanner } from "./AdminNetworkBanner";
import { AdminTxBanner } from "./AdminTxBanner";
import { OverviewPanel } from "./panels/OverviewPanel";
import { AnalyticsPanel } from "./panels/AnalyticsPanel";
import { HealthPanel } from "./panels/HealthPanel";
import { PoolsPanel } from "./panels/PoolsPanel";
import { RewardsPanel } from "./panels/RewardsPanel";
import { AirdropPanel } from "./panels/AirdropPanel";
import { VaultPanel } from "./panels/VaultPanel";
import { SystemPanel } from "./panels/SystemPanel";

const ADMIN_TABS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "health", label: "Health", icon: Activity },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "pools", label: "Pool", icon: Droplets },
  { id: "rewards", label: "Rewards", icon: Coins },
  { id: "airdrop", label: "Airdrop", icon: Gift },
  { id: "vault", label: "Vault", icon: Vault },
  { id: "system", label: "System", icon: Settings },
] as const;

export type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

function ReadOnlyBanner({
  isConnected,
  canWrite,
  isKeeper,
}: {
  isConnected: boolean;
  canWrite: boolean;
  isKeeper: boolean;
}) {
  if (canWrite) return null;
  return (
    <div
      className={cn(
        "mb-4 px-3 py-2.5 rounded-lg border text-xs leading-relaxed",
        isConnected
          ? isKeeper
            ? "bg-cyan-900/20 border-cyan-800/40 text-cyan-200"
            : "bg-zinc-800/60 border-zinc-700 text-zinc-400"
          : "bg-zinc-800/40 border-zinc-700 text-zinc-500"
      )}
    >
      {!isConnected ? (
        <>
          <strong className="text-zinc-300">Read-only mode.</strong> Connect a vault / airdrop owner wallet to
          submit transactions. Monitoring works without a wallet.
        </>
      ) : isKeeper ? (
        <>
          <strong className="text-cyan-300">Keeper wallet.</strong> You can harvest and rebalance on the Vault tab.
          Owner-only settings remain read-only.
        </>
      ) : (
        <>
          <strong className="text-zinc-300">Read-only.</strong> This wallet is not vault or airdrop owner. All
          on-chain metrics are visible; writes are disabled.
        </>
      )}
    </div>
  );
}

export function AdminShell() {
  const [tab, setTab] = useState<AdminTabId>("overview");
  const chainId = useEffectiveChainId();
  const chainMeta = getChainDeploymentMeta(chainId);
  const { isConnected, canWrite, isAirdropOwner, isVaultOwner, isAdapterOwner, isKeeper, address } =
    useAdminAuth();
  const { openWalletModal } = useApp();

  const roleBadges = [
    isVaultOwner ? "Vault Owner" : null,
    isAirdropOwner ? "Airdrop Owner" : null,
    isAdapterOwner && !isVaultOwner ? "Adapter Owner" : null,
    isKeeper && !isVaultOwner ? "Keeper" : null,
  ].filter((b): b is string => b !== null);

  const renderPanel = () => {
    switch (tab) {
      case "overview":
        return <OverviewPanel />;
      case "health":
        return <HealthPanel />;
      case "analytics":
        return <AnalyticsPanel />;
      case "pools":
        return <PoolsPanel />;
      case "rewards":
        return <RewardsPanel />;
      case "airdrop":
        return <AirdropPanel />;
      case "vault":
        return <VaultPanel />;
      case "system":
        return <SystemPanel />;
      default:
        return null;
    }
  };

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
        <AdminTabProvider tab={tab} setTab={setTab}>
          <AdminActionsProvider>
            <AdminNetworkBanner />
            <AdminTxBanner />
            <ReadOnlyBanner isConnected={isConnected} canWrite={canWrite} isKeeper={isKeeper} />

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

            {renderPanel()}

            {!isConnected && (
              <div className="mt-6 card-glass rounded-2xl p-4 border border-zinc-800/80 text-center">
                <LayoutDashboard className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">
                  Connect vault or airdrop owner wallet to enable write actions.
                </p>
                <button
                  type="button"
                  onClick={openWalletModal}
                  className="mt-3 gradient-btn px-5 py-2 rounded-xl text-sm font-semibold"
                >
                  Connect Wallet
                </button>
              </div>
            )}
          </AdminActionsProvider>
        </AdminTabProvider>
      </main>

      <footer className="py-4 text-center text-xs text-zinc-600 border-t border-zinc-800/50">
        Hyperpool Admin — read-only monitoring + owner-gated writes ·{" "}
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
