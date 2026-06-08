"use client";

import { formatUnits } from "viem";
import { useReadContract } from "wagmi";
import { useAdminAuth } from "@/lib/hooks/useAdmin";
import { abis } from "@/lib/contracts";
import { AdminCard, StatBox, AddressChip } from "../AdminUi";

export function PointsPanel() {
  const { deployment, isPointsOwner, pointsOwner } = useAdminAuth();

  const { data: dailyPool } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "DAILY_POOL",
    query: { enabled: !!deployment },
  });

  const { data: currentEpoch } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "currentEpoch",
    query: { enabled: !!deployment },
  });

  const { data: epochStart } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "epochStart",
    query: { enabled: !!deployment },
  });

  const { data: referralAddr } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "referralRegistry",
    query: { enabled: !!deployment },
  });

  if (!deployment) return null;

  return (
    <div className="space-y-4">
      <AdminCard title="Points System" subtitle="Fee-generation-based rewards (not capital size)">
        {!isPointsOwner && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/40 text-xs text-amber-300">
            Read-only view. Connect PointsDistributor owner ({String(pointsOwner ?? "…").slice(0, 10)}…) to authorize pools.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StatBox
            label="Daily Pool"
            value={dailyPool !== undefined ? formatUnits(dailyPool as bigint, 18) : "—"}
            sub="PTS per epoch cap (display)"
          />
          <StatBox label="Current Epoch" value={currentEpoch !== undefined ? String(currentEpoch) : "—"} />
        </div>

        <div className="mt-4 space-y-2 text-xs text-zinc-400">
          <p>
            <span className="text-zinc-500">Epoch started:</span>{" "}
            {epochStart !== undefined
              ? new Date(Number(epochStart) * 1000).toLocaleString()
              : "—"}
          </p>
          <AddressChip label="Referral Registry" address={String(referralAddr ?? deployment.referralRegistry)} />
        </div>
      </AdminCard>

      <AdminCard title="Distribution Rules">
        <ul className="text-sm text-zinc-400 space-y-2 list-disc list-inside">
          <li>Points accrue 1:1 with swap fees recorded by authorized pools</li>
          <li>Referees receive 10% boost via ReferralRegistry</li>
          <li>Referrers earn 15% bonus on referee-generated points</li>
          <li>Epochs advance automatically every 24h on next fee record</li>
          <li>Users claim accumulated points via claimDailyRewards</li>
        </ul>
      </AdminCard>

      <AdminCard title="Admin Actions">
        <p className="text-sm text-zinc-500">
          Pool authorization is managed in the <strong className="text-zinc-300">Pools</strong> tab.
          Epoch advancement is automatic — no manual trigger required.
        </p>
      </AdminCard>
    </div>
  );
}
