"use client";

import Link from "next/link";
import { BookOpen, Droplets, Gift, Shield, Vault, Coins } from "lucide-react";
import { defaultChain } from "@/lib/wagmi/config";
import { getChainDeploymentMeta, getVaultAddress } from "@/lib/contracts";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useAdminAuth, useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { AdminCard, StatBox, AddressRow } from "../AdminUi";

const RUNBOOK = [
  { href: "https://github.com/kekeke29341/hyper_evm/blob/main/docs/admin-guide.md", label: "Admin guide" },
  { href: "https://github.com/kekeke29341/hyper_evm/blob/main/docs/deployment.md", label: "Deployment" },
  { href: "https://github.com/kekeke29341/hyper_evm/blob/main/docs/vercel.md", label: "Vercel env" },
];

export function OverviewPanel() {
  const chainId = useEffectiveChainId();
  const meta = getChainDeploymentMeta(chainId);
  const { isAirdropOwner, isVaultOwner, address, deployment } = useAdminAuth();
  const analytics = useAdminAnalytics();

  const quickActions = [
    { tab: "vault", label: "Vault & harvest", icon: Vault, enabled: isVaultOwner },
    { tab: "airdrop", label: "Auto payout", icon: Gift, enabled: isAirdropOwner },
    { tab: "rewards", label: "Fee split (33/67)", icon: Coins, enabled: true },
    { tab: "pools", label: "Pool", icon: Droplets, enabled: true },
    { tab: "system", label: "Keeper / operator", icon: Shield, enabled: isVaultOwner },
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
          <StatBox label="Contracts" value={meta.live ? "Live" : "Not deployed"} sub={meta.configured ? "JSON present" : "—"} />
          <StatBox
            label="Pending rewards"
            value={
              analytics.pendingUserRewards !== undefined
                ? `${Number(analytics.pendingUserRewards) / 1e6}`
                : "—"
            }
            sub="67% user pool (USDC)"
          />
        </div>
        {deployment && (
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-1">
            <AddressRow label="Your wallet" address={address ?? "—"} />
            <AddressRow label="Vault" address={getVaultAddress(deployment) ?? "—"} />
          </div>
        )}
      </AdminCard>

      <AdminCard title="Quick actions" subtitle="Jump to common owner operations">
        <div className="grid sm:grid-cols-2 gap-2">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <div
                key={a.tab}
                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800"
              >
                <Icon className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{a.label}</p>
                  <p className="text-[10px] text-zinc-500 capitalize">{a.tab} tab</p>
                </div>
                {a.enabled ? (
                  <span className="text-[10px] text-emerald-400">Ready</span>
                ) : (
                  <span className="text-[10px] text-zinc-600">Read-only</span>
                )}
              </div>
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
          <li>
            <Link href="/" className="text-zinc-400 hover:text-white text-sm">
              ← Back to public app
            </Link>
          </li>
        </ul>
        <p className="text-[10px] text-zinc-600 mt-4 leading-relaxed">
          Production: set <code className="text-zinc-400">NEXT_PUBLIC_ADMIN_ENABLED=false</code>. Enable only on
          Preview or local builds. All writes require vault or airdrop owner wallet.
        </p>
      </AdminCard>
    </div>
  );
}
