"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { useAdminAuth, useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { useAdminTx } from "@/lib/admin/AdminActionsContext";
import { abis } from "@/lib/contracts";
import { AdminCard, AdminButton, AdminInput, StatBox, AddressRow } from "../AdminUi";
import { useApp } from "@/lib/store";

export function SystemPanel() {
  const { deployment, isVaultOwner, vaultAddress } = useAdminAuth();
  const { operatorWallet, operatorFeeBps, vaultKeeper } = useAdminAnalytics();
  const { setOperatorWallet, setVaultKeeper, isPending } = useAdminTx();
  const { showToast } = useApp();

  const [operatorInput, setOperatorInput] = useState("");
  const [keeperInput, setKeeperInput] = useState("");

  const { data: refBonus } = useReadContract({
    address: deployment?.referralRegistry,
    abi: abis.referral,
    functionName: "REFERRER_BONUS_BPS",
    query: { enabled: !!deployment?.referralRegistry },
  });

  const { data: refBoost } = useReadContract({
    address: deployment?.referralRegistry,
    abi: abis.referral,
    functionName: "REFEREE_BOOST_BPS",
    query: { enabled: !!deployment?.referralRegistry },
  });

  if (!deployment) return null;

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      showToast(ok);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed");
    }
  };

  const resolve = (input: string, fallback: string): Address => {
    const v = input.trim() || fallback;
    if (!isAddress(v)) throw new Error(`Invalid address: ${v}`);
    return v;
  };

  return (
    <div className="space-y-4">
      <AdminCard title="Vault configuration" subtitle="Vault owner wallet only">
        {!isVaultOwner && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/40 text-xs text-amber-300">
            Read-only. Connect vault owner to update keeper or operator wallet.
          </div>
        )}
        <div className="space-y-1 mb-4">
          <AddressRow label="Vault" address={vaultAddress ?? "—"} />
          <AddressRow label="Keeper" address={String(vaultKeeper ?? "—")} />
          <AddressRow label="Operator wallet (33%)" address={String(operatorWallet ?? "—")} />
          <StatBox
            label="Operator fee"
            value={operatorFeeBps !== undefined ? `${Number(operatorFeeBps) / 100}%` : "33%"}
            sub="Immutable unless contract upgraded"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <AdminInput
            label="setOperatorWallet"
            value={operatorInput}
            onChange={setOperatorInput}
            placeholder={String(operatorWallet ?? "")}
          />
          <AdminInput
            label="setKeeper"
            value={keeperInput}
            onChange={setKeeperInput}
            placeholder={String(vaultKeeper ?? "")}
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <AdminButton
            variant="secondary"
            disabled={isPending || !isVaultOwner}
            onClick={() =>
              run(
                () => setOperatorWallet(resolve(operatorInput, String(operatorWallet))),
                "Operator wallet updated"
              )
            }
          >
            Update operator wallet
          </AdminButton>
          <AdminButton
            variant="secondary"
            disabled={isPending || !isVaultOwner}
            onClick={() =>
              run(() => setVaultKeeper(resolve(keeperInput, String(vaultKeeper))), "Keeper updated")
            }
          >
            Update keeper
          </AdminButton>
        </div>
        <p className="text-[10px] text-zinc-600 mt-3">
          Rebalance (+10% / −30%, fixed for all users) is keeper-driven via <code className="text-zinc-400">scripts/keeper-rebalance.mjs</code>.
        </p>
      </AdminCard>

      {deployment.referralRegistry && (
        <AdminCard title="Referral registry" subtitle="Immutable bonus constants (on-chain)">
          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label="Referrer bonus"
              value={refBonus !== undefined ? `${Number(refBonus) / 100}%` : "—"}
              sub="Of referee rewards"
            />
            <StatBox
              label="Referee boost"
              value={refBoost !== undefined ? `${Number(refBoost) / 100}%` : "—"}
              sub="On base rewards"
            />
          </div>
          <AddressRow label="Registry" address={deployment.referralRegistry} />
          <p className="text-xs text-zinc-500 mt-3">
            Codes are registered by users via the public Affiliate tab.
          </p>
        </AdminCard>
      )}
    </div>
  );
}
