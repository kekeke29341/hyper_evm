"use client";

import { AdminCard, AddressRow } from "../AdminUi";
import { useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { PROJECT_X_POOL, MANAGED_LP_RANGE } from "@/lib/constants";

export function PoolsPanel() {
  const { deployment } = useAdminAnalytics();

  if (!deployment) return null;

  const pool = deployment.projectXPool ?? PROJECT_X_POOL.poolAddress;
  const npm = deployment.projectXNpm;

  return (
    <div className="space-y-4">
      <AdminCard
        title="Pool"
        subtitle="Hyperpool deposits via adapter — no self-built AMM pairs"
      >
        <div className="space-y-1">
          <AddressRow label="WHYPE/USDC pool (0.3%)" address={pool} />
          {npm && <AddressRow label="NPM" address={npm} />}
          {deployment.projectXAdapter && (
            <AddressRow label="ProjectXAdapter" address={deployment.projectXAdapter} />
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
          Keeper maintains a <strong className="text-zinc-300">fixed {MANAGED_LP_RANGE.label}</strong> range for all users around
          the reference price. Collected fees split <strong className="text-zinc-300">7% operations</strong> /{" "}
          <strong className="text-zinc-300">60% user auto payout</strong> /{" "}
          <strong className="text-zinc-300">33% owner</strong> (JST 7:00).
        </p>
      </AdminCard>
    </div>
  );
}
