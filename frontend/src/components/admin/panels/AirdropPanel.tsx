"use client";

import { useState } from "react";
import { formatUnits, type Hex } from "viem";
import { useReadContract } from "wagmi";
import { useAdminAuth, useAdminAnalytics } from "@/lib/hooks/useAdmin";
import { useAdminTx } from "@/lib/admin/AdminActionsContext";
import MerkleAirdropAbi from "@/lib/contracts/abis/MerkleAirdrop.json";
import { buildMerkleRoot, parseAirdropCsv } from "@/lib/admin/merkle";
import { AdminCard, AdminButton, AdminInput } from "../AdminUi";
import { useApp } from "@/lib/store";
import { abis } from "@/lib/contracts";

const SAMPLE_CSV = `0x70997970C51812dc3A010C7d01b50e0d17dc79C8,1000000000
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,500000000`;

export function AirdropPanel() {
  const { deployment, isAirdropOwner, airdropOwner, address } = useAdminAuth();
  const { airdropPaused } = useAdminAnalytics();
  const {
    setMerkleRoot,
    fundAirdrop,
    generateAndSetRoot,
    pauseAirdrop,
    unpauseAirdrop,
    recoverAirdrop,
    isPending,
  } = useAdminTx();
  const { showToast } = useApp();

  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [deadlineDays, setDeadlineDays] = useState("30");
  const [fundAmount, setFundAmount] = useState("1000");
  const [manualRoot, setManualRoot] = useState("");
  const [previewRoot, setPreviewRoot] = useState<Hex | "">("");
  const [recoverTo, setRecoverTo] = useState("");

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

  const handlePreview = () => {
    try {
      const entries = parseAirdropCsv(csv);
      setPreviewRoot(buildMerkleRoot(entries));
      showToast(`Merkle root: ${buildMerkleRoot(entries).slice(0, 18)}…`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Invalid CSV");
    }
  };

  const handleGenerateAndSet = async () => {
    try {
      const root = await generateAndSetRoot(csv, Number(deadlineDays));
      showToast(`Root set: ${root.slice(0, 14)}…`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Set root failed");
    }
  };

  const handleManualSet = async () => {
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineDays) * 86400);
      await setMerkleRoot(manualRoot as Hex, deadline);
      showToast("Merkle root updated");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Set root failed");
    }
  };

  const handleFund = async () => {
    if (!address) return;
    try {
      await fundAirdrop(fundAmount);
      showToast(`Funded ${fundAmount} USDC`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fund failed");
    }
  };

  const handleRecover = async () => {
    if (!recoverTo.trim()) return;
    try {
      await recoverAirdrop(recoverTo.trim() as `0x${string}`);
      showToast("Unclaimed USDC recovered");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Recover failed");
    }
  };

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
            <p className="text-xs text-zinc-500">Active Root</p>
            <p className="text-xs font-mono text-cyan-400 mt-1 break-all">
              {merkleRoot && (merkleRoot as Hex) !== "0x" + "0".repeat(64)
                ? String(merkleRoot)
                : "Not set"}
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Balance / Deadline / Status</p>
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
                <span className="text-emerald-400">Claims open</span>
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

      <AdminCard title="Generate Merkle Root" subtitle="One address,amount per line (USDC 6 decimals)">
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-500/50"
        />
        <div className="flex flex-wrap gap-2 mt-3">
          <AdminInput label="Deadline (days)" value={deadlineDays} onChange={setDeadlineDays} type="number" />
        </div>
        {previewRoot && (
          <p className="text-xs font-mono text-zinc-500 mt-2 break-all">Preview: {previewRoot}</p>
        )}
        <div className="flex gap-2 mt-3">
          <AdminButton variant="secondary" onClick={handlePreview} disabled={isPending}>
            Preview Root
          </AdminButton>
          <AdminButton onClick={handleGenerateAndSet} disabled={isPending || !isAirdropOwner}>
            Generate & Set Root
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard title="Manual Root" subtitle="Paste bytes32 root directly">
        <AdminInput
          label="Merkle root (0x…)"
          value={manualRoot}
          onChange={setManualRoot}
          placeholder="0x…"
        />
        <div className="mt-3">
          <AdminButton onClick={handleManualSet} disabled={isPending || !isAirdropOwner || !manualRoot}>
            Set Root
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard title="Fund Airdrop">
        <AdminInput label="USDC amount" value={fundAmount} onChange={setFundAmount} type="number" />
        <div className="mt-3">
          <AdminButton onClick={handleFund} disabled={isPending || !isAirdropOwner || !address}>
            Approve & Fund
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard title="Recover unclaimed" subtitle="After claim deadline expires">
        <AdminInput label="Recipient address" value={recoverTo} onChange={setRecoverTo} placeholder={address ?? "0x…"} />
        <div className="mt-3">
          <AdminButton
            variant="danger"
            onClick={handleRecover}
            disabled={isPending || !isAirdropOwner || !recoverTo.trim()}
          >
            Recover to wallet
          </AdminButton>
        </div>
      </AdminCard>
    </div>
  );
}
