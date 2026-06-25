"use client";

import { formatUnits } from "viem";
import { useAdminAuth, useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { AdminCard, StatBox } from "../AdminUi";

export function RewardsPanel() {
  const { isVaultOwner } = useAdminAuth();
  const { pendingUserRewards, operatorFeeBps, operatorWallet, vaultAssets } = useAdminAnalytics();

  const userSharePct =
    operatorFeeBps !== undefined ? ((10000 - Number(operatorFeeBps)) / 100).toFixed(0) : "70";
  const opsSharePct = operatorFeeBps !== undefined ? (Number(operatorFeeBps) / 100).toFixed(0) : "30";

  return (
    <div className="space-y-4">
      <AdminCard
        title="Fee distribution"
        subtitle="Collected LP fees — daily USDC auto payout to Vault shareholders"
      >
        {!isVaultOwner && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/40 text-xs text-amber-300">
            Read-only. Connect vault owner to pull pending rewards or update operator wallet on the System tab.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StatBox label="User pool" value={`${userSharePct}%`} sub="Daily USDC auto payout" />
          <StatBox label="Operator share" value={`${opsSharePct}%`} sub={String(operatorWallet ?? "—").slice(0, 14) + "…"} />
          <StatBox
            label="Pending user rewards"
            value={pendingUserRewards !== undefined ? formatUnits(pendingUserRewards as bigint, 6) : "—"}
            sub="USDC in vault (67% pool)"
          />
          <StatBox
            label="Vault assets (USDC)"
            value={vaultAssets !== undefined ? formatUnits(vaultAssets as bigint, 6) : "—"}
            sub="Including pending rewards"
          />
        </div>
      </AdminCard>

      <AdminCard title="Daily runbook">
        <ul className="text-sm text-zinc-400 space-y-2 list-disc list-inside">
          <li>JST 7:00 — keeper runs harvest via vault (or scripts/daily-rewards.mjs)</li>
          <li>33% USDC sent to operator wallet; 67% accrues as pendingUserRewards</li>
          <li>Build recipient list from vault share holders (+ referral boosts)</li>
          <li>Pull pending rewards to MerkleAirdrop → distributeRewards sends USDC directly to users</li>
          <li>No user claim button or claim window; users simply receive the payout in their wallet</li>
        </ul>
      </AdminCard>
    </div>
  );
}
