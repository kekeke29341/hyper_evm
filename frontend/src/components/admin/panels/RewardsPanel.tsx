"use client";

import { formatUnits } from "viem";
import { PROJECT_X_POOL } from "@/lib/constants";
import { useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { AdminCard, StatBox } from "../AdminUi";

export function RewardsPanel() {
  const { pendingUserRewards, operatorFeeBps, ownerFeeBps, operatorWallet, ownerFeeWallet, vaultAssets } = useAdminAnalytics();

  const opsSharePct =
    operatorFeeBps !== undefined ? (Number(operatorFeeBps) / 100).toFixed(0) : String(PROJECT_X_POOL.operatorShareBps / 100);
  const ownerSharePct =
    ownerFeeBps !== undefined ? (Number(ownerFeeBps) / 100).toFixed(0) : String(PROJECT_X_POOL.ownerShareBps / 100);
  const userSharePct =
    operatorFeeBps !== undefined && ownerFeeBps !== undefined
      ? ((10000 - Number(operatorFeeBps) - Number(ownerFeeBps)) / 100).toFixed(0)
      : String(PROJECT_X_POOL.userShareBps / 100);

  return (
    <div className="space-y-4">
      <AdminCard
        title="Fee distribution"
        subtitle="Collected LP fees — daily USDC auto payout to Vault shareholders"
      >
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="User pool" value={`${userSharePct}%`} sub="Daily USDC auto payout" />
          <StatBox label="Operations share" value={`${opsSharePct}%`} sub={String(operatorWallet ?? "—").slice(0, 14) + "…"} />
          <StatBox label="Owner share" value={`${ownerSharePct}%`} sub={String(ownerFeeWallet ?? "—").slice(0, 14) + "…"} />
          <StatBox
            label="Pending user rewards"
            value={pendingUserRewards !== undefined ? formatUnits(pendingUserRewards as bigint, 6) : "—"}
            sub="USDC in vault (60% pool)"
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
          <li>7% USDC to operations wallet; 33% to owner wallet; 60% accrues as pendingUserRewards</li>
          <li>Build recipient list from vault share holders (+ referral boosts)</li>
          <li>Pull pending rewards to MerkleAirdrop → distributeRewards sends USDC directly to users</li>
          <li>No user claim button or claim window; users simply receive the payout in their wallet</li>
        </ul>
      </AdminCard>
    </div>
  );
}
