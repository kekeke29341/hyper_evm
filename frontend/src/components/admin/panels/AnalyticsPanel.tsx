"use client";

import { formatUnits } from "viem";
import { useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { AdminCard, StatBox, AddressChip } from "../AdminUi";

export function AnalyticsPanel() {
  const { deployment, reserves, pairsLen, currentEpoch, totalDistributed, epochFees, timeLeft, airdropBalance } =
    useAdminAnalytics();

  if (!deployment) {
    return (
      <AdminCard title="Analytics">
        <p className="text-sm text-zinc-500">No deployment for this chain. Use Anvil (31337).</p>
      </AdminCard>
    );
  }

  const r0 = reserves ? (reserves as readonly [bigint, bigint, number])[0] : BigInt(0);
  const r1 = reserves ? (reserves as readonly [bigint, bigint, number])[1] : BigInt(0);

  const hoursLeft = timeLeft !== undefined ? Number(timeLeft) / 3600 : 0;

  return (
    <div className="space-y-4">
      <AdminCard title="Platform Analytics" subtitle="On-chain metrics from Factory, Pair, and PointsDistributor">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox label="Pools" value={pairsLen !== undefined ? String(pairsLen) : "—"} sub="Factory allPairs" />
          <StatBox
            label="kHYPE Reserve"
            value={formatUnits(r0, 18)}
            sub="Primary pair"
          />
          <StatBox label="USDC Reserve" value={formatUnits(r1, 6)} sub="Primary pair" />
          <StatBox
            label="Airdrop USDC"
            value={airdropBalance !== undefined ? formatUnits(airdropBalance as bigint, 6) : "—"}
            sub="MerkleAirdrop balance"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          <StatBox label="Current Epoch" value={currentEpoch !== undefined ? String(currentEpoch) : "—"} />
          <StatBox
            label="Epoch Fees"
            value={epochFees !== undefined ? formatUnits(epochFees as bigint, 18) : "—"}
            sub="Fee-weighted volume"
          />
          <StatBox
            label="Total PTS Distributed"
            value={totalDistributed !== undefined ? formatUnits(totalDistributed as bigint, 18) : "—"}
          />
        </div>

        <p className="text-xs text-zinc-500 mt-4">
          Next epoch in ~{hoursLeft.toFixed(1)}h (auto-advances on next swap fee record)
        </p>
      </AdminCard>

      <AdminCard title="Contract Addresses">
        <div className="space-y-2">
          <AddressChip label="Factory" address={deployment.factory} />
          <AddressChip label="Router" address={deployment.router} />
          <AddressChip label="Pair" address={deployment.pair} />
          <AddressChip label="Points" address={deployment.pointsDistributor} />
          <AddressChip label="Airdrop" address={deployment.airdrop} />
          <AddressChip label="Referral" address={deployment.referralRegistry} />
        </div>
      </AdminCard>
    </div>
  );
}
