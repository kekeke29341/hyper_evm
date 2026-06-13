"use client";

import { formatUnits } from "viem";
import { useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { AdminCard, StatBox, AddressRow } from "../AdminUi";

export function AnalyticsPanel() {
  const chainId = useEffectiveChainId();
  const {
    deployment,
    reserves,
    pairsLen,
    currentEpoch,
    totalDistributed,
    epochFees,
    timeLeft,
    airdropBalance,
    lpSupply,
    trustedRouter,
    vaultPaused,
    vaultManagedLp,
    airdropPaused,
  } = useAdminAnalytics();

  if (!deployment) {
    return (
      <AdminCard title="Analytics">
        <p className="text-sm text-zinc-500">No deployment for chain {chainId}. Deploy contracts or switch network.</p>
      </AdminCard>
    );
  }

  const r0 = reserves ? (reserves as readonly [bigint, bigint, number])[0] : BigInt(0);
  const r1 = reserves ? (reserves as readonly [bigint, bigint, number])[1] : BigInt(0);
  const usdcReserve = parseFloat(formatUnits(r1, 6));
  const hoursLeft = timeLeft !== undefined ? Number(timeLeft) / 3600 : 0;

  return (
    <div className="space-y-4">
      <AdminCard title="Platform analytics" subtitle="Live on-chain reads (10s refresh on reserves)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox label="Pools" value={pairsLen !== undefined ? String(pairsLen) : "—"} sub="Factory allPairs" />
          <StatBox label="kHYPE reserve" value={formatUnits(r0, 18)} sub="Primary pair" />
          <StatBox label="USDC reserve" value={formatUnits(r1, 6)} sub="Primary pair" />
          <StatBox
            label="Pool TVL (approx)"
            value={`$${(usdcReserve * 2).toFixed(2)}`}
            sub="2× USDC side"
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <StatBox
            label="LP supply"
            value={lpSupply !== undefined ? formatUnits(lpSupply as bigint, 18) : "—"}
            sub="Pair ERC20"
          />
          <StatBox
            label="Airdrop USDC"
            value={airdropBalance !== undefined ? formatUnits(airdropBalance as bigint, 6) : "—"}
            sub={airdropPaused ? "Paused" : "Active"}
          />
          <StatBox
            label="Vault managed LP"
            value={vaultManagedLp !== undefined ? formatUnits(vaultManagedLp as bigint, 18) : "—"}
            sub={vaultPaused ? "Vault paused" : deployment.liquidityVault ? "Phase 3" : "N/A"}
          />
          <StatBox label="Trusted router" value={String(trustedRouter ?? deployment.router).slice(0, 12) + "…"} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <StatBox label="Current epoch" value={currentEpoch !== undefined ? String(currentEpoch) : "—"} />
          <StatBox
            label="Epoch fees"
            value={epochFees !== undefined ? formatUnits(epochFees as bigint, 18) : "—"}
            sub="Fee-weighted volume"
          />
          <StatBox
            label="Total PTS distributed"
            value={totalDistributed !== undefined ? formatUnits(totalDistributed as bigint, 18) : "—"}
          />
        </div>

        <p className="text-xs text-zinc-500 mt-4">
          Next epoch in ~{hoursLeft.toFixed(1)}h (auto-advances on next swap fee record)
        </p>
      </AdminCard>

      <AdminCard title="Contract addresses">
        <div className="space-y-1">
          <AddressRow label="Factory" address={deployment.factory} />
          <AddressRow label="Router" address={deployment.router} />
          <AddressRow label="Pair" address={deployment.pair} />
          <AddressRow label="Points" address={deployment.pointsDistributor} />
          <AddressRow label="Airdrop" address={deployment.airdrop} />
          <AddressRow label="Referral" address={deployment.referralRegistry} />
          {deployment.liquidityVault && (
            <AddressRow label="Vault" address={deployment.liquidityVault} />
          )}
          <AddressRow label="kHYPE" address={deployment.tokenKHYPE} />
          <AddressRow label="USDC" address={deployment.tokenUSDC} />
        </div>
      </AdminCard>
    </div>
  );
}
