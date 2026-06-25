"use client";

import { formatUnits, type Hex } from "viem";
import { useReadContract } from "wagmi";
import { useAdminAuth, useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { useAdminTx } from "@/lib/admin/AdminActionsContext";
import MerkleAirdropAbi from "@/lib/contracts/abis/MerkleAirdrop.json";
import { AdminCard, AdminButton } from "../AdminUi";
import { useApp } from "@/lib/store";
import { abis } from "@/lib/contracts";

export function AirdropPanel() {
  const { deployment, isAirdropOwner, airdropOwner } = useAdminAuth();
  const { airdropPaused } = useAdminAnalytics();
  const {
    pauseAirdrop,
    unpauseAirdrop,
    isPending,
  } = useAdminTx();
  const { showToast } = useApp();

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
      <AdminCard title="Cashdrop / Airdrop" subtitle="MerkleAirdrop owner controls">
        {!isAirdropOwner && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/40 text-xs text-amber-300">
            Read-only. Connect MerkleAirdrop owner ({String(airdropOwner ?? "…").slice(0, 10)}…) to manage.
          </div>
        )}

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
        <div className="flex flex-wrap gap-2">
          <AdminButton
            variant="danger"
            disabled={isPending || !isAirdropOwner || airdropPaused === true}
            onClick={() => pauseAirdrop().then(() => showToast("Airdrop paused")).catch(() => showToast("Pause failed"))}
          >
            Pause claims
          </AdminButton>
          <AdminButton
            variant="secondary"
            disabled={isPending || !isAirdropOwner || airdropPaused === false}
            onClick={() => unpauseAirdrop().then(() => showToast("Airdrop unpaused")).catch(() => showToast("Unpause failed"))}
          >
            Unpause
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard title="Daily auto payout" subtitle="No user claim button or Merkle claim window">
        <p className="text-sm text-zinc-400">
          <code className="text-cyan-300">scripts/daily-rewards.mjs</code> harvests fees, pulls the 67% user pool to
          MerkleAirdrop, and calls <code className="text-cyan-300">distributeRewards</code> to send USDC directly to
          eligible wallets at JST 7:00.
        </p>
      </AdminCard>
    </div>
  );
}
