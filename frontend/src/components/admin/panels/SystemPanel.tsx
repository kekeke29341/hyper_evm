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
  const { deployment, isFactoryAdmin, feeToSetter } = useAdminAuth();
  const { trustedRouter } = useAdminAnalytics();
  const {
    setFeeCollector,
    setPointsDistributorOnFactory,
    setTrustedRouter,
    setFeeToSetter,
    isPending,
  } = useAdminTx();
  const { showToast } = useApp();

  const [feeCollector, setFeeCollectorInput] = useState("");
  const [pointsDist, setPointsDistInput] = useState("");
  const [routerAddr, setRouterAddr] = useState("");
  const [newFeeToSetter, setNewFeeToSetter] = useState("");

  const { data: factoryFeeCollector } = useReadContract({
    address: deployment?.factory,
    abi: abis.factory,
    functionName: "feeCollector",
    query: { enabled: !!deployment },
  });

  const { data: factoryPoints } = useReadContract({
    address: deployment?.factory,
    abi: abis.factory,
    functionName: "pointsDistributor",
    query: { enabled: !!deployment },
  });

  const { data: refBonus } = useReadContract({
    address: deployment?.referralRegistry,
    abi: abis.referral,
    functionName: "REFERRER_BONUS_BPS",
    query: { enabled: !!deployment },
  });

  const { data: refBoost } = useReadContract({
    address: deployment?.referralRegistry,
    abi: abis.referral,
    functionName: "REFEREE_BOOST_BPS",
    query: { enabled: !!deployment },
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
      <AdminCard title="Factory configuration" subtitle="feeToSetter wallet only">
        {!isFactoryAdmin && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/40 text-xs text-amber-300">
            Read-only. Factory admin: {String(feeToSetter ?? "…").slice(0, 14)}…
          </div>
        )}
        <div className="space-y-1 mb-4">
          <AddressRow label="feeToSetter" address={String(feeToSetter ?? "—")} />
          <AddressRow label="feeCollector" address={String(factoryFeeCollector ?? "—")} />
          <AddressRow label="pointsDistributor" address={String(factoryPoints ?? "—")} />
          <AddressRow label="trustedRouter" address={String(trustedRouter ?? deployment.router)} />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <AdminInput
            label="setFeeCollector"
            value={feeCollector}
            onChange={setFeeCollectorInput}
            placeholder={String(factoryFeeCollector ?? "")}
          />
          <AdminInput
            label="setPointsDistributor"
            value={pointsDist}
            onChange={setPointsDistInput}
            placeholder={String(factoryPoints ?? "")}
          />
          <AdminInput
            label="setTrustedRouter"
            value={routerAddr}
            onChange={setRouterAddr}
            placeholder={deployment.router}
          />
          <AdminInput
            label="setFeeToSetter (transfer admin)"
            value={newFeeToSetter}
            onChange={setNewFeeToSetter}
            placeholder="0x…"
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <AdminButton
            variant="secondary"
            disabled={isPending || !isFactoryAdmin}
            onClick={() =>
              run(
                () => setFeeCollector(resolve(feeCollector, String(factoryFeeCollector))),
                "Fee collector updated"
              )
            }
          >
            Update fee collector
          </AdminButton>
          <AdminButton
            variant="secondary"
            disabled={isPending || !isFactoryAdmin}
            onClick={() =>
              run(
                () => setPointsDistributorOnFactory(resolve(pointsDist, String(factoryPoints))),
                "Points distributor updated"
              )
            }
          >
            Update points distributor
          </AdminButton>
          <AdminButton
            variant="secondary"
            disabled={isPending || !isFactoryAdmin}
            onClick={() =>
              run(() => setTrustedRouter(resolve(routerAddr, deployment.router)), "Trusted router updated")
            }
          >
            Update trusted router
          </AdminButton>
          <AdminButton
            variant="danger"
            disabled={isPending || !isFactoryAdmin || !newFeeToSetter}
            onClick={() =>
              run(() => setFeeToSetter(resolve(newFeeToSetter, "")), "FeeToSetter transferred")
            }
          >
            Transfer factory admin
          </AdminButton>
        </div>
        <p className="text-[10px] text-zinc-600 mt-3">
          After changing fee collector or points distributor, run <strong>Sync All Pairs</strong> on the Pools tab.
        </p>
      </AdminCard>

      <AdminCard title="Referral registry" subtitle="Immutable bonus constants (on-chain)">
        <div className="grid grid-cols-2 gap-3">
          <StatBox
            label="Referrer bonus"
            value={refBonus !== undefined ? `${Number(refBonus) / 100}%` : "—"}
            sub="Of referee points"
          />
          <StatBox
            label="Referee boost"
            value={refBoost !== undefined ? `${Number(refBoost) / 100}%` : "—"}
            sub="On base points"
          />
        </div>
        <AddressRow label="Registry" address={deployment.referralRegistry} />
        <p className="text-xs text-zinc-500 mt-3">
          Codes are registered by users via the public Affiliate tab. No admin register API on-chain.
        </p>
      </AdminCard>
    </div>
  );
}
