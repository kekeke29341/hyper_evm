"use client";

import { AdminCard, AddressRow } from "../AdminUi";
import { useAdminAuth } from "@/lib/hooks/useAdmin";
import { PROJECT_X_POOL } from "@/lib/constants";

export function PoolsPanel() {
  const { deployment } = useAdminAuth();

  if (!deployment) return null;

  const pool = deployment.projectXPool ?? PROJECT_X_POOL.poolAddress;
  const npm = deployment.projectXNpm;

  return (
    <div className="space-y-4">
      <AdminCard
        title="Project X pool"
        subtitle="Hyperpool deposits via adapter — no self-built AMM pairs"
      >
        <div className="space-y-1">
          <AddressRow label="WHYPE/USDC pool (0.05%)" address={pool} />
          {npm && <AddressRow label="Project X NPM" address={npm} />}
          {deployment.projectXAdapter && (
            <AddressRow label="ProjectXAdapter" address={deployment.projectXAdapter} />
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
          Keeper maintains an asymmetric range of <strong className="text-zinc-300">+10% / −30%</strong> around
          the reference price. Collected fees split <strong className="text-zinc-300">30% operator</strong> /{" "}
          <strong className="text-zinc-300">70% user Merkle</strong> (JST 7:00–9:00 claim).
        </p>
      </AdminCard>
    </div>
  );
}
