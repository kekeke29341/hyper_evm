"use client";

import { useEffect, useMemo } from "react";
import { useConnection, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, parseUnits, zeroAddress } from "viem";
import { abis, getDeployment, getVaultAddress } from "@/lib/contracts";
import { ensureExactAllowance } from "@/lib/erc20";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import MerkleAirdropAbi from "@/lib/contracts/abis/MerkleAirdrop.json";
import ownableAbi from "@/lib/contracts/ownableAbi.json";
import { buildMerkleRoot, parseAirdropCsv, type AirdropEntry } from "@/lib/admin/merkle";

export function useAdminAuth() {
  const { address, isConnected } = useConnection();
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);
  const vaultAddress = deployment ? getVaultAddress(deployment) : undefined;

  const { data: airdropOwner } = useReadContract({
    address: deployment?.airdrop,
    abi: ownableAbi,
    functionName: "owner",
    query: { enabled: !!deployment?.airdrop },
  });

  const { data: vaultOwner } = useReadContract({
    address: vaultAddress,
    abi: ownableAbi,
    functionName: "owner",
    query: { enabled: !!vaultAddress },
  });

  const roles = useMemo(() => {
    if (!address) {
      return { isAdmin: false, isAirdropOwner: false, isVaultOwner: false };
    }
    const a = address.toLowerCase();
    const isAirdropOwner = airdropOwner ? (airdropOwner as string).toLowerCase() === a : false;
    const isVaultOwner = vaultOwner ? (vaultOwner as string).toLowerCase() === a : false;
    return {
      isAdmin: isAirdropOwner || isVaultOwner,
      isAirdropOwner,
      isVaultOwner,
    };
  }, [address, airdropOwner, vaultOwner]);

  return { ...roles, isConnected, address, deployment, vaultAddress, airdropOwner, vaultOwner };
}

export function useAdminAnalytics() {
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);
  const vaultAddress = deployment ? getVaultAddress(deployment) : undefined;

  const { data: airdropBalance } = useReadContract({
    address: deployment?.tokenUSDC,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: deployment?.airdrop ? [deployment.airdrop] : undefined,
    query: { enabled: !!deployment?.airdrop },
  });

  const { data: vaultSupply } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "totalSupply",
    query: { enabled: !!vaultAddress, refetchInterval: 10_000 },
  });

  const { data: vaultAssets } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "totalAssetsUsdc",
    query: { enabled: !!vaultAddress, refetchInterval: 10_000 },
  });

  const { data: pendingUserRewards } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "pendingUserRewards",
    query: { enabled: !!vaultAddress, refetchInterval: 10_000 },
  });

  const { data: operatorWallet } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "operatorWallet",
    query: { enabled: !!vaultAddress },
  });

  const { data: operatorFeeBps } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "operatorFeeBps",
    query: { enabled: !!vaultAddress },
  });

  const { data: vaultKeeper } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "keeper",
    query: { enabled: !!vaultAddress },
  });

  const { data: airdropPaused } = useReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "paused",
    query: { enabled: !!deployment?.airdrop },
  });

  return {
    deployment,
    vaultAddress,
    airdropBalance,
    vaultSupply,
    vaultAssets,
    pendingUserRewards,
    operatorWallet,
    operatorFeeBps,
    vaultKeeper,
    airdropPaused,
  };
}

export function useAdminActions() {
  const chainId = useEffectiveChainId();
  const { address: connectedAddress } = useConnection();
  const deployment = getDeployment(chainId);
  const vaultAddress = deployment ? getVaultAddress(deployment) : undefined;
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId });

  // On-chain gate state: when the airdrop has a vaultShareToken, claim leaves MUST be gated
  // (account, amount, minShares). Building a non-gated root here would make every claim revert.
  const { data: vaultShareToken } = useReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "vaultShareToken",
    query: { enabled: !!deployment?.airdrop },
  });
  const isGated = !!vaultShareToken && (vaultShareToken as string) !== zeroAddress;

  // Pin every admin write to the deployment chain so a wallet on the wrong network can't
  // submit against an address resolved from a different chain's deployment.
  type WriteCfg = Parameters<typeof writeContractAsync>[0];
  const writeWithChain = (cfg: WriteCfg) => writeContractAsync({ ...cfg, chainId });

  // After a confirmed write, refetch admin reads so the UI reflects on-chain state
  // (keeper/operator/paused/root etc. otherwise show stale values behind a success toast).
  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);

  const setMerkleRoot = async (root: `0x${string}`, deadline: bigint) => {
    if (!deployment) throw new Error("No deployment");
    await writeWithChain({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "setMerkleRoot",
      args: [root, deadline],
    });
  };

  const fundAirdrop = async (amountUsdc: string) => {
    if (!deployment) throw new Error("No deployment");
    if (!publicClient) throw new Error("RPC unavailable");
    if (!connectedAddress) throw new Error("Wallet not connected");
    const amount = parseUnits(amountUsdc, 6);
    // Only approve when the existing allowance is insufficient; then fund. The fund tx is the
    // last write, so the success banner (keyed on its receipt) reflects actual funding, not approve.
    await ensureExactAllowance(
      publicClient,
      writeWithChain,
      deployment.tokenUSDC as Address,
      abis.erc20,
      connectedAddress,
      deployment.airdrop as Address,
      amount,
      chainId
    );
    await writeWithChain({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "fund",
      args: [amount],
    });
  };

  const pauseAirdrop = async () => {
    if (!deployment) throw new Error("No deployment");
    await writeWithChain({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "pause",
    });
  };

  const unpauseAirdrop = async () => {
    if (!deployment) throw new Error("No deployment");
    await writeWithChain({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "unpause",
    });
  };

  const setVaultKeeper = async (keeper: Address) => {
    if (!vaultAddress) throw new Error("No vault");
    await writeWithChain({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "setKeeper",
      args: [keeper],
    });
  };

  const setOperatorWallet = async (wallet: Address) => {
    if (!vaultAddress) throw new Error("No vault");
    await writeWithChain({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "setOperatorWallet",
      args: [wallet],
    });
  };

  const pullPendingRewards = async (to: Address, amountUsdc: string) => {
    if (!vaultAddress) throw new Error("No vault");
    const amount = parseUnits(amountUsdc, 6);
    await writeWithChain({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "pullPendingRewards",
      args: [to, amount],
    });
  };

  const harvestFees = async () => {
    if (!vaultAddress) throw new Error("No vault");
    await writeWithChain({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "harvestFees",
    });
  };

  const recoverVaultForeignToken = async (token: Address, to: Address, amount: string, decimals: number) => {
    if (!vaultAddress) throw new Error("No vault");
    await writeWithChain({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "recoverForeignToken",
      args: [token, to, parseUnits(amount, decimals)],
    });
  };

  const recoverAdapterToken = async (token: Address, to: Address, amount: string, decimals: number) => {
    if (!deployment?.projectXAdapter) throw new Error("No adapter");
    await writeWithChain({
      address: deployment.projectXAdapter as Address,
      abi: abis.adapter,
      functionName: "recoverToken",
      args: [token, to, parseUnits(amount, decimals)],
    });
  };

  const generateAndSetRoot = async (csv: string, deadlineDays: number) => {
    const entries: AirdropEntry[] = parseAirdropCsv(csv);
    // The on-chain airdrop decides gated vs non-gated purely by whether vaultShareToken is set.
    // Build the tree to match, otherwise the root won't verify any proof and every claim reverts.
    if (isGated) {
      const missing = entries.filter((e) => e.minShares === undefined || e.minShares <= 0n);
      if (missing.length > 0) {
        throw new Error(
          `Airdrop is gated (vaultShareToken set): every CSV row needs a positive minShares (3rd column). ${missing.length} row(s) missing it.`
        );
      }
    }
    const root = buildMerkleRoot(entries, isGated);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineDays * 86400);
    await setMerkleRoot(root, deadline);
    return root;
  };

  return {
    setMerkleRoot,
    fundAirdrop,
    pauseAirdrop,
    unpauseAirdrop,
    setVaultKeeper,
    setOperatorWallet,
    pullPendingRewards,
    harvestFees,
    recoverVaultForeignToken,
    recoverAdapterToken,
    generateAndSetRoot,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
  };
}
