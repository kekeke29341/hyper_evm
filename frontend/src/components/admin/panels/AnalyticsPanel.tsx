"use client";

import { formatUnits } from "viem";
import { VAULT_SHARE_DECIMALS } from "@/lib/constants";
import { useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { getVaultAddress } from "@/lib/contracts";
import { AdminCard, StatBox, AddressRow } from "../AdminUi";

export function AnalyticsPanel() {
  const chainId = useEffectiveChainId();
  const {
    deployment,
    airdropBalance,
    vaultSupply,
    vaultAssets,
    pendingUserRewards,
    operatorFeeBps,
    operatorWallet,
    airdropPaused,
  } = useAdminAnalytics();

  if (!deployment) {
    return (
      <AdminCard title="Analytics">
        <p className="text-sm text-zinc-500">No deployment for chain {chainId}. Deploy contracts or switch network.</p>
      </AdminCard>
    );
  }

  const userSharePct =
    operatorFeeBps !== undefined ? ((10000 - Number(operatorFeeBps)) / 100).toFixed(0) : "70";

  return (
    <div className="space-y-4">
      <AdminCard title="Platform analytics" subtitle="Live on-chain reads (10s refresh)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            label="Vault shares"
            value={vaultSupply !== undefined ? formatUnits(vaultSupply as bigint, VAULT_SHARE_DECIMALS) : "—"}
            sub="hp-VAULT"
          />
          <StatBox
            label="Vault assets"
            value={vaultAssets !== undefined ? formatUnits(vaultAssets as bigint, 6) : "—"}
            sub="USDC equivalent"
          />
          <StatBox
            label="Pending user rewards"
            value={pendingUserRewards !== undefined ? formatUnits(pendingUserRewards as bigint, 6) : "—"}
            sub={`${userSharePct}% fee pool`}
          />
          <StatBox
            label="Airdrop USDC"
            value={airdropBalance !== undefined ? formatUnits(airdropBalance as bigint, 6) : "—"}
            sub={airdropPaused ? "Paused" : "Active"}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <StatBox label="Operator share" value="30%" sub={String(operatorWallet ?? "—").slice(0, 14) + "…"} />
          <StatBox label="User Merkle share" value="70%" sub="JST 7:00–9:00 claim" />
          <StatBox label="LP range" value="+10% / −30%" sub="Project X WHYPE/USDC" />
        </div>
      </AdminCard>

      <AdminCard title="Contract addresses">
        <div className="space-y-1">
          {getVaultAddress(deployment) && (
            <AddressRow label="HyperpoolVault" address={getVaultAddress(deployment)!} />
          )}
          {deployment.projectXAdapter && (
            <AddressRow label="ProjectXAdapter" address={deployment.projectXAdapter} />
          )}
          {deployment.projectXPool && (
            <AddressRow label="Project X pool" address={deployment.projectXPool} />
          )}
          <AddressRow label="Airdrop" address={deployment.airdrop} />
          {deployment.referralRegistry && (
            <AddressRow label="Referral" address={deployment.referralRegistry} />
          )}
          <AddressRow label="HYPE" address={deployment.tokenKHYPE} />
          <AddressRow label="USDC" address={deployment.tokenUSDC} />
        </div>
      </AdminCard>
    </div>
  );
}
