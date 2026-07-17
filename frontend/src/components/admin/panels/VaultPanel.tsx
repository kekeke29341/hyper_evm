"use client";

import { formatUnits } from "viem";
import { VAULT_SHARE_DECIMALS, MANAGED_LP_RANGE } from "@/lib/constants";
import { useAdminAnalytics, useAdminHealth } from "@/lib/hooks/useAdmin";
import { formatRefPriceUsd } from "@/lib/admin/health";
import { AdminCard, StatBox, AddressRow } from "../AdminUi";

export function VaultPanel() {
  const {
    deployment,
    vaultAddress,
    vaultSupply,
    vaultAssets,
    pendingUserRewards,
    vaultKeeper,
    operatorWallet,
    ownerFeeWallet,
    vaultPaused,
  } = useAdminAnalytics();
  const health = useAdminHealth();

  if (!vaultAddress) {
    return (
      <AdminCard title="Hyperpool Vault">
        <p className="text-sm text-zinc-500">No vault in this deployment JSON.</p>
      </AdminCard>
    );
  }

  return (
    <div className="space-y-4">
      <AdminCard title="Hyperpool Vault" subtitle="Managed LP — ERC20 shares (read-only view)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            label="Vault shares"
            value={vaultSupply !== undefined ? formatUnits(vaultSupply as bigint, VAULT_SHARE_DECIMALS) : "—"}
            sub="hp-VAULT supply"
          />
          <StatBox
            label="Total assets"
            value={vaultAssets !== undefined ? formatUnits(vaultAssets as bigint, 6) : "—"}
            sub="USDC (incl. pending)"
          />
          <StatBox
            label="Pending user rewards"
            value={pendingUserRewards !== undefined ? formatUnits(pendingUserRewards as bigint, 6) : "—"}
            sub="60% fee pool"
          />
          <StatBox label="Range" value={MANAGED_LP_RANGE.label} sub="Fixed · keeper rebalance" />
          <StatBox label="Status" value={vaultPaused ? "Paused" : "Active"} sub="Vault deposits / withdraws" />
          <StatBox
            label="Pool price"
            value={formatRefPriceUsd(health.poolPrice)}
            sub="USDC / HYPE"
          />
          <StatBox
            label="Oracle price"
            value={formatRefPriceUsd(health.oraclePrice)}
            sub="USDC / HYPE"
          />
          <StatBox
            label="LP in range"
            value={health.inRange === null ? "—" : health.inRange ? "Yes" : "No"}
            sub={
              health.tickLower !== null && health.tickUpper !== null
                ? `Ticks ${health.tickLower} … ${health.tickUpper}`
                : "See Health tab"
            }
          />
        </div>
        <div className="mt-4 space-y-1">
          <AddressRow label="Vault" address={vaultAddress} />
          {deployment?.projectXAdapter && (
            <AddressRow label="Adapter" address={deployment.projectXAdapter} />
          )}
          <AddressRow label="Keeper" address={String(vaultKeeper ?? "—")} />
          <AddressRow label="Operator (7%)" address={String(operatorWallet ?? "—")} />
          <AddressRow label="Owner fee wallet (33%)" address={String(ownerFeeWallet ?? "—")} />
        </div>
      </AdminCard>

      <AdminCard
        title="Operations"
        subtitle="This dashboard cannot submit transactions — operations run from the CLI with the owner / keeper key"
      >
        <ul className="text-sm text-zinc-400 space-y-2 list-disc list-inside">
          <li>
            Daily harvest + Cashdrop payout: <code className="text-cyan-300">scripts/daily-rewards.mjs</code> (JST 7:00
            cron)
          </li>
          <li>
            Rebalance to the fixed {MANAGED_LP_RANGE.label} range: <code className="text-cyan-300">scripts/keeper-rebalance.mjs</code>
          </li>
          <li>
            Pause / unpause, keeper &amp; operator changes, token recovery: Foundry <code className="text-cyan-300">cast
            send</code> with the owner key — see the admin guide runbook
          </li>
        </ul>
      </AdminCard>
    </div>
  );
}
