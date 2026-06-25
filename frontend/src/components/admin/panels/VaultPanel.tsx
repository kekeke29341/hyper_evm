"use client";

import { useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { VAULT_SHARE_DECIMALS } from "@/lib/constants";
import { useAdminAuth, useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { useAdminTx } from "@/lib/admin/AdminActionsContext";
import { AdminCard, AdminButton, AdminInput, StatBox, AddressRow } from "../AdminUi";
import { useApp } from "@/lib/store";

export function VaultPanel() {
  const { deployment, isVaultOwner, vaultAddress, address } = useAdminAuth();
  const { vaultSupply, vaultAssets, pendingUserRewards, vaultKeeper, operatorWallet } = useAdminAnalytics();
  const { setVaultKeeper, pullPendingRewards, harvestFees, recoverVaultForeignToken, isPending } = useAdminTx();
  const { showToast } = useApp();

  const [keeper, setKeeper] = useState("");
  const [pullTo, setPullTo] = useState("");
  const [pullAmount, setPullAmount] = useState("");
  const [foreignToken, setForeignToken] = useState("");
  const [foreignAmount, setForeignAmount] = useState("");
  const [foreignDecimals, setForeignDecimals] = useState("18");

  if (!vaultAddress) {
    return (
      <AdminCard title="Hyperpool Vault">
        <p className="text-sm text-zinc-500">No vault in this deployment JSON.</p>
      </AdminCard>
    );
  }

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
      <AdminCard title="Hyperpool Vault" subtitle="Managed LP — ERC20 shares">
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
            sub="67% fee pool"
          />
          <StatBox label="Range" value="+10% / −30%" sub="Fixed · keeper rebalance" />
        </div>
        <div className="mt-4 space-y-1">
          <AddressRow label="Vault" address={vaultAddress} />
          {deployment?.projectXAdapter && (
            <AddressRow label="Adapter" address={deployment.projectXAdapter} />
          )}
          <AddressRow label="Keeper" address={String(vaultKeeper ?? "—")} />
          <AddressRow label="Operator" address={String(operatorWallet ?? "—")} />
        </div>
      </AdminCard>

      <AdminCard title="Vault admin" subtitle="Owner or keeper for harvest">
        <div className="grid sm:grid-cols-2 gap-3">
          <AdminInput label="New keeper" value={keeper} onChange={setKeeper} placeholder="0x…" />
          <AdminButton
            variant="secondary"
            disabled={isPending || !keeper || !isAddress(keeper) || !isVaultOwner}
            onClick={() => run(() => setVaultKeeper(keeper as Address), "Keeper updated")}
          >
            Set keeper
          </AdminButton>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <AdminButton
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => harvestFees(), "Harvest submitted")}
          >
            Harvest fees (collect + 33/67 split)
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard title="Move Cashdrop funds" subtitle="Normally handled by scripts/daily-rewards.mjs before auto payout">
        <div className="grid sm:grid-cols-2 gap-3">
          <AdminInput
            label="Recipient (Airdrop payout contract)"
            value={pullTo}
            onChange={setPullTo}
            placeholder={deployment?.airdrop ?? "0x…"}
          />
          <AdminInput label="Amount USDC" value={pullAmount} onChange={setPullAmount} placeholder="0.00" />
        </div>
        <div className="mt-3">
          <AdminButton
            disabled={isPending || !isVaultOwner || !pullAmount}
            onClick={() =>
              run(
                () =>
                  pullPendingRewards(
                    resolveAddr(pullTo, deployment?.airdrop ?? ""),
                    pullAmount
                  ),
                "Pending rewards pulled"
              )
            }
          >
            pullPendingRewards
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard
        title="Recover mistaken send (Vault)"
        subtitle="Non-USDC / non-HYPE tokens only. Underlying assets require withdraw via vault shares."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <AdminInput label="Token address" value={foreignToken} onChange={setForeignToken} placeholder="0x…" />
          <AdminInput label="Amount" value={foreignAmount} onChange={setForeignAmount} placeholder="0.00" />
          <AdminInput label="Decimals" value={foreignDecimals} onChange={setForeignDecimals} placeholder="18" />
        </div>
        <div className="mt-3">
          <AdminButton
            disabled={isPending || !isVaultOwner || !foreignToken || !foreignAmount}
            onClick={() => {
              if (!address) {
                showToast("Connect owner wallet");
                return;
              }
              run(
                () =>
                  recoverVaultForeignToken(
                    foreignToken as Address,
                    address,
                    foreignAmount,
                    Number(foreignDecimals) || 18
                  ),
                "Foreign token recovered"
              );
            }}
          >
            recoverForeignToken → connected wallet
          </AdminButton>
        </div>
      </AdminCard>
    </div>
  );
}

function resolveAddr(input: string, fallback: string): Address {
  const v = input.trim() || fallback;
  if (!isAddress(v)) throw new Error(`Invalid address: ${v}`);
  return v;
}
