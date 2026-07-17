"use client";

import { MANAGED_LP_RANGE } from "@/lib/constants";
import { useReadContract } from "wagmi";
import { useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { abis } from "@/lib/contracts";
import { AdminCard, StatBox, AddressRow } from "../AdminUi";

export function SystemPanel() {
  const {
    deployment,
    vaultAddress,
    operatorWallet,
    ownerFeeWallet,
    operatorFeeBps,
    ownerFeeBps,
    vaultKeeper,
    maxRebalanceDeviationBps,
    feeSwapSlippageBps,
    convertHypeFeesToUsdc,
    swapRouter,
  } = useAdminAnalytics();

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

  return (
    <div className="space-y-4">
      <AdminCard title="Vault configuration" subtitle="On-chain settings (read-only)">
        <div className="space-y-1 mb-4">
          <AddressRow label="Vault" address={vaultAddress ?? "—"} />
          <AddressRow label="Keeper" address={String(vaultKeeper ?? "—")} />
          <AddressRow label="Operations wallet (7%)" address={String(operatorWallet ?? "—")} />
          <AddressRow label="Owner fee wallet (33%)" address={String(ownerFeeWallet ?? "—")} />
          {swapRouter !== undefined && <AddressRow label="Swap router" address={String(swapRouter)} />}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            label="Fee split"
            value={
              operatorFeeBps !== undefined && ownerFeeBps !== undefined
                ? `${Number(operatorFeeBps) / 100}% / ${(10000 - Number(operatorFeeBps) - Number(ownerFeeBps)) / 100}% / ${Number(ownerFeeBps) / 100}%`
                : "7% / 60% / 33%"
            }
            sub="ops / user / owner"
          />
          <StatBox
            label="Rebalance guard"
            value={maxRebalanceDeviationBps !== undefined ? `${Number(maxRebalanceDeviationBps) / 100}%` : "—"}
            sub="Max ref-price deviation"
          />
          <StatBox
            label="Fee swap slippage"
            value={feeSwapSlippageBps !== undefined ? `${Number(feeSwapSlippageBps) / 100}%` : "—"}
            sub="HYPE→USDC harvest swap"
          />
          <StatBox
            label="HYPE fees → USDC"
            value={convertHypeFeesToUsdc === undefined ? "—" : convertHypeFeesToUsdc ? "On" : "Off"}
            sub="Harvest conversion"
          />
        </div>
        <p className="text-[10px] text-zinc-600 mt-3">
          Configuration changes (keeper / operator / pause) are owner-key operations executed from the CLI — this page
          cannot submit transactions. Rebalance ({MANAGED_LP_RANGE.label}, fixed for all users) is keeper-driven via{" "}
          <code className="text-zinc-400">scripts/keeper-rebalance.mjs</code>.
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
