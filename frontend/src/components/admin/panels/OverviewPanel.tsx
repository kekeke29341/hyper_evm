"use client";

import { BookOpen, Droplets, Gift, BarChart3, Vault, Activity, List } from "lucide-react";
import { formatUnits } from "viem";
import { defaultChain } from "@/lib/wagmi/config";
import { getChainDeploymentMeta, getVaultAddress } from "@/lib/contracts";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { useAdminTab } from "@/lib/admin/AdminTabContext";
import type { AdminTabId } from "@/components/admin/AdminShell";
import { AdminCard, StatBox, AddressRow } from "../AdminUi";
import { ActivityFeed } from "./ActivityPanel";

const RUNBOOK = [
  { href: "https://github.com/kekeke29341/hyper_evm/blob/main/docs/admin-guide.md", label: "Admin guide" },
  { href: "https://github.com/kekeke29341/hyper_evm/blob/main/docs/deployment.md", label: "Deployment" },
  { href: "https://github.com/kekeke29341/hyper_evm/blob/main/docs/vercel.md", label: "Vercel env" },
];

export function OverviewPanel() {
  const chainId = useEffectiveChainId();
  const meta = getChainDeploymentMeta(chainId);
  const analytics = useAdminAnalytics();
  const { setTab } = useAdminTab();
  const deployment = analytics.deployment;

  const quickLinks: { tab: AdminTabId; label: string; sub: string; icon: typeof Vault }[] = [
    { tab: "activity", label: "Fund flows & user activity", sub: "Deposits, withdrawals, payouts", icon: List },
    { tab: "health", label: "Health & monitoring", sub: "Prices, range, invariants", icon: Activity },
    { tab: "analytics", label: "Analytics", sub: "TVL, shares, fee split", icon: BarChart3 },
    { tab: "vault", label: "Vault", sub: "Assets, keeper, operator", icon: Vault },
    { tab: "airdrop", label: "Cashdrop", sub: "Payout status & balance", icon: Gift },
    { tab: "pools", label: "Pool", sub: "LP range & adapter", icon: Droplets },
  ];

  return (
    <div className="space-y-4">
      <AdminCard title="Environment" subtitle="Active deployment target for this session">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox label="Chain" value={meta.label} sub={`ID ${chainId}`} />
          <StatBox
            label="Default app chain"
            value={defaultChain.name}
            sub={`Build target ${defaultChain.id}`}
          />
          <StatBox
            label="Vault assets"
            value={
              analytics.vaultAssets !== undefined
                ? `${formatUnits(analytics.vaultAssets as bigint, 6)}`
                : "—"
            }
            sub="USDC equivalent"
          />
          <StatBox
            label="Pending rewards"
            value={
              analytics.pendingUserRewards !== undefined
                ? `${Number(analytics.pendingUserRewards) / 1e6}`
                : "—"
            }
            sub="60% user pool (USDC)"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <StatBox
            label="Vault"
            value={analytics.vaultPaused ? "Paused" : "Active"}
            sub="See Health tab"
          />
          <StatBox
            label="Cashdrop"
            value={analytics.airdropPaused ? "Paused" : "Active"}
            sub="See Airdrop tab"
          />
        </div>
        {deployment && (
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-1">
            <AddressRow label="Vault" address={getVaultAddress(deployment) ?? "—"} />
          </div>
        )}
      </AdminCard>

      <AdminCard title="Recent activity" subtitle="Latest on-chain fund movements — full history on the Activity tab">
        <ActivityFeed limit={6} compact />
        <button
          type="button"
          onClick={() => setTab("activity")}
          className="mt-3 text-xs text-cyan-400 hover:underline"
        >
          View all activity →
        </button>
      </AdminCard>

      <AdminCard title="Monitoring" subtitle="Jump to a dashboard section">
        <div className="grid sm:grid-cols-2 gap-2">
          {quickLinks.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.tab}
                type="button"
                onClick={() => setTab(a.tab)}
                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 transition-colors text-left w-full"
              >
                <Icon className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{a.label}</p>
                  <p className="text-[10px] text-zinc-500">{a.sub}</p>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">View</span>
              </button>
            );
          })}
        </div>
      </AdminCard>

      <AdminCard title="Runbook" subtitle="Operational documentation">
        <ul className="space-y-2 text-sm">
          {RUNBOOK.map((item) => (
            <li key={item.label}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline flex items-center gap-2"
              >
                <BookOpen className="w-3.5 h-3.5" />
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-zinc-600 mt-4 leading-relaxed">
          This dashboard is <strong className="text-zinc-400">read-only</strong>: it never submits transactions and
          cannot move funds. Owner / keeper operations (harvest, rebalance, pause, recovery) run via the CLI scripts
          documented in the admin guide.
        </p>
      </AdminCard>
    </div>
  );
}
