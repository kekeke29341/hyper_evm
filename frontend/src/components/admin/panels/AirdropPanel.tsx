"use client";

import { formatUnits, type Hex } from "viem";
import { useReadContract } from "wagmi";
import { useAdminAuth, useAdminAnalytics } from "@/lib/hooks/useAdmin";
import MerkleAirdropAbi from "@/lib/contracts/abis/MerkleAirdrop.json";
import { AdminCard, AddressRow } from "../AdminUi";
import { abis } from "@/lib/contracts";

export function AirdropPanel() {
  const { deployment, airdropOwner } = useAdminAuth();
  const { airdropPaused } = useAdminAnalytics();

  const { data: merkleRoot } = useReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "merkleRoot",
    query: { enabled: !!deployment },
  });

  const { data: claimDeadline } = useReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "claimDeadline",
    query: { enabled: !!deployment },
  });

  const { data: airdropBalance } = useReadContract({
    address: deployment?.tokenUSDC,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: deployment?.airdrop ? [deployment.airdrop] : undefined,
    query: { enabled: !!deployment },
  });

  if (!deployment) return null;

  return (
    <div className="space-y-4">
      <AdminCard title="Cashdrop / Airdrop" subtitle="MerkleAirdrop status (read-only)">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Legacy Merkle Root</p>
            <p className="text-xs font-mono text-cyan-400 mt-1 break-all">
              {merkleRoot && (merkleRoot as Hex) !== "0x" + "0".repeat(64)
                ? String(merkleRoot)
                : "Not set"}
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Balance / Legacy Deadline / Status</p>
            <p className="text-sm text-white mt-1">
              {airdropBalance !== undefined ? formatUnits(airdropBalance as bigint, 6) : "—"} USDC
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {claimDeadline && Number(claimDeadline) > 0
                ? new Date(Number(claimDeadline) * 1000).toLocaleString()
                : "No deadline"}
            </p>
            <p className="text-xs mt-1">
              {airdropPaused ? (
                <span className="text-amber-400">Paused</span>
              ) : (
                <span className="text-emerald-400">Auto payouts enabled</span>
              )}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <AddressRow label="Airdrop contract" address={deployment.airdrop} />
          <AddressRow label="Owner" address={String(airdropOwner ?? "—")} />
        </div>
        <p className="text-[10px] text-zinc-600 mt-3">
          Pause / unpause and fund movements are owner-key CLI operations — this page cannot submit transactions.
        </p>
      </AdminCard>

      <AdminCard title="Daily auto payout" subtitle="No user claim button or Merkle claim window">
        <p className="text-sm text-zinc-400">
          <code className="text-cyan-300">scripts/daily-rewards.mjs</code> harvests fees, pulls the 60% user pool to
          MerkleAirdrop, and calls <code className="text-cyan-300">distributeRewards</code> to send USDC directly to
          eligible wallets at JST 7:00. Individual payouts appear on the{" "}
          <strong className="text-zinc-300">Activity</strong> tab.
        </p>
      </AdminCard>
    </div>
  );
}
