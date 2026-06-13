"use client";

import { useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { useAdminAuth, useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { useAdminTx } from "@/lib/admin/AdminActionsContext";
import { abis } from "@/lib/contracts";
import { AdminCard, AdminButton, AdminInput, StatBox, AddressRow } from "../AdminUi";
import { useApp } from "@/lib/store";

export function VaultPanel() {
  const { deployment, isVaultOwner } = useAdminAuth();
  const { vaultPaused, vaultKeeper, vaultManagedLp } = useAdminAnalytics();
  const { pauseVault, unpauseVault, setVaultKeeper, setVaultTargetRange, isPending } = useAdminTx();
  const { showToast } = useApp();

  const [keeper, setKeeper] = useState("");
  const [rangeBps, setRangeBps] = useState("600");

  const { data: targetRange } = useReadContract({
    address: deployment?.liquidityVault,
    abi: abis.liquidityVault,
    functionName: "targetRangeBps",
    query: { enabled: !!deployment?.liquidityVault },
  });

  const { data: vaultSupply } = useReadContract({
    address: deployment?.liquidityVault,
    abi: abis.erc20,
    functionName: "totalSupply",
    query: { enabled: !!deployment?.liquidityVault, refetchInterval: 10_000 },
  });

  if (!deployment?.liquidityVault) {
    return (
      <AdminCard title="Liquidity Vault">
        <p className="text-sm text-zinc-500">No liquidity vault in this deployment JSON.</p>
      </AdminCard>
    );
  }

  const vault = deployment.liquidityVault;

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      showToast(ok);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <AdminCard title="Phase 3 Vault" subtitle="HyperpoolLiquidityVault — Zap LP shares">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            label="Status"
            value={vaultPaused ? "Paused" : "Active"}
            sub={vaultPaused ? "Deposits disabled" : "Open"}
          />
          <StatBox
            label="Vault shares"
            value={vaultSupply !== undefined ? formatUnits(vaultSupply as bigint, 18) : "—"}
            sub="ERC20 supply"
          />
          <StatBox
            label="Managed LP"
            value={vaultManagedLp !== undefined ? formatUnits(vaultManagedLp as bigint, 18) : "—"}
            sub="LP in vault"
          />
          <StatBox
            label="Target range"
            value={targetRange !== undefined ? `${String(targetRange)} bps` : "—"}
            sub="Display band"
          />
        </div>
        <div className="mt-4 space-y-1">
          <AddressRow label="Vault" address={vault} />
          <AddressRow label="Keeper" address={String(vaultKeeper ?? "—")} />
        </div>
      </AdminCard>

      <AdminCard title="Vault admin" subtitle="Vault owner wallet required">
        <div className="grid sm:grid-cols-2 gap-3">
          <AdminInput label="New keeper" value={keeper} onChange={setKeeper} placeholder="0x…" />
          <AdminInput label="Target range (bps)" value={rangeBps} onChange={setRangeBps} type="number" />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <AdminButton
            variant="secondary"
            disabled={isPending || !keeper || !isAddress(keeper) || !isVaultOwner}
            onClick={() => run(() => setVaultKeeper(keeper as Address), "Keeper updated")}
          >
            Set keeper
          </AdminButton>
          <AdminButton
            variant="secondary"
            disabled={isPending || !isVaultOwner}
            onClick={() => run(() => setVaultTargetRange(Number(rangeBps)), "Range updated")}
          >
            Set range
          </AdminButton>
          <AdminButton
            variant="danger"
            disabled={isPending || vaultPaused === true || !isVaultOwner}
            onClick={() => run(() => pauseVault(), "Vault paused")}
          >
            Pause
          </AdminButton>
          <AdminButton
            disabled={isPending || vaultPaused === false || !isVaultOwner}
            onClick={() => run(() => unpauseVault(), "Vault unpaused")}
          >
            Unpause
          </AdminButton>
        </div>
      </AdminCard>
    </div>
  );
}
