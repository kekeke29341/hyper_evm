"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  Droplets,
  Gift,
  BarChart3,
  ArrowLeft,
  Vault,
  Settings,
  Home,
  Coins,
  Activity,
  Eye,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { getChainDeploymentMeta } from "@/lib/contracts";
import { AdminTabProvider } from "@/lib/admin/AdminTabContext";
import { AdminNetworkBanner } from "./AdminNetworkBanner";
import { OverviewPanel } from "./panels/OverviewPanel";
import { ActivityPanel } from "./panels/ActivityPanel";
import { AnalyticsPanel } from "./panels/AnalyticsPanel";
import { HealthPanel } from "./panels/HealthPanel";
import { PoolsPanel } from "./panels/PoolsPanel";
import { RewardsPanel } from "./panels/RewardsPanel";
import { AirdropPanel } from "./panels/AirdropPanel";
import { VaultPanel } from "./panels/VaultPanel";
import { SystemPanel } from "./panels/SystemPanel";

const ADMIN_TABS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "activity", label: "Activity", icon: List },
  { id: "health", label: "Health", icon: Activity },
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

  const renderPanel = () => {
    switch (tab) {
      case "overview":
        return <OverviewPanel />;
      case "activity":
        return <ActivityPanel />;
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

            <span className="ml-auto md:ml-0 flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0 font-semibold">
              <Eye className="w-3 h-3" />
              Read-only
            </span>
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
          <AdminNetworkBanner />
          {renderPanel()}
        </AdminTabProvider>
      </main>

      <footer className="py-4 text-center text-xs text-zinc-600 border-t border-zinc-800/50">
        Hyperpool Admin — read-only monitoring. No contract writes from this page; operations run via CLI scripts ·{" "}
        <a
          href="https://github.com/kekeke29341/hyper_evm/blob/main/docs/admin-guide.md"
          className="text-zinc-500 hover:text-cyan-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          Admin guide
        </a>
      </footer>
    </div>
  );
}
