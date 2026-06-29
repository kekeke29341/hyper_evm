"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { AdminCard, AddressRow, AdminInput, AdminButton } from "../AdminUi";
import { useAdminAuth } from "@/lib/hooks/useAdmin";
import { useAdminTx } from "@/lib/admin/AdminActionsContext";
import { useApp } from "@/lib/store";
import { PROJECT_X_POOL } from "@/lib/constants";

export function PoolsPanel() {
  const { deployment, isAdapterOwner, isVaultOwner, address } = useAdminAuth();
  const { recoverAdapterToken, isPending } = useAdminTx();
  const { showToast } = useApp();

  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [decimals, setDecimals] = useState("6");

  if (!deployment) return null;

  const pool = deployment.projectXPool ?? PROJECT_X_POOL.poolAddress;
  const npm = deployment.projectXNpm;

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
      <AdminCard
        title="Pool"
        subtitle="Hyperpool deposits via adapter — no self-built AMM pairs"
      >
        <div className="space-y-1">
          <AddressRow label="WHYPE/USDC pool (0.05%)" address={pool} />
          {npm && <AddressRow label="NPM" address={npm} />}
          {deployment.projectXAdapter && (
            <AddressRow label="ProjectXAdapter" address={deployment.projectXAdapter} />
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
          Keeper maintains a <strong className="text-zinc-300">fixed +10% / −30%</strong> range for all users around
          the reference price. Collected fees split <strong className="text-zinc-300">33% operator</strong> /{" "}
          <strong className="text-zinc-300">67% user auto payout</strong> (JST 7:00).
        </p>
      </AdminCard>

      <AdminCard
        title="Recover mistaken send (Adapter)"
        subtitle="Idle USDC/HYPE or other tokens on the adapter (not in LP position NAV)."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <AdminInput label="Token address" value={token} onChange={setToken} placeholder="0x…" />
          <AdminInput label="Amount" value={amount} onChange={setAmount} placeholder="0.00" />
          <AdminInput label="Decimals" value={decimals} onChange={setDecimals} placeholder="6" />
        </div>
        <div className="mt-3">
          <AdminButton
            disabled={isPending || !(isAdapterOwner || isVaultOwner) || !token || !amount || !isAddress(token)}
            onClick={() => {
              if (!address) {
                showToast("Connect owner wallet");
                return;
              }
              run(
                () => recoverAdapterToken(token as Address, address, amount, Number(decimals) || 6),
                "Adapter token recovered"
              );
            }}
          >
            recoverToken → connected wallet
          </AdminButton>
        </div>
      </AdminCard>
    </div>
  );
}
