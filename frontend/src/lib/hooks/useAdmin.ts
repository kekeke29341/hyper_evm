"use client";

import { useMemo } from "react";
import { useConnection, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address, parseUnits } from "viem";
import { abis, getDeployment, getVaultAddress } from "@/lib/contracts";
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
  const deployment = getDeployment(chainId);
  const vaultAddress = deployment ? getVaultAddress(deployment) : undefined;
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const setMerkleRoot = async (root: `0x${string}`, deadline: bigint) => {
    if (!deployment) throw new Error("No deployment");
    await writeContractAsync({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "setMerkleRoot",
      args: [root, deadline],
    });
  };

  const fundAirdrop = async (amountUsdc: string) => {
    if (!deployment) throw new Error("No deployment");
    const amount = parseUnits(amountUsdc, 6);
    await writeContractAsync({
      address: deployment.tokenUSDC,
      abi: abis.erc20,
      functionName: "approve",
      args: [deployment.airdrop, amount],
    });
    await writeContractAsync({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "fund",
      args: [amount],
    });
  };

  const pauseAirdrop = async () => {
    if (!deployment) throw new Error("No deployment");
    await writeContractAsync({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "pause",
    });
  };

  const unpauseAirdrop = async () => {
    if (!deployment) throw new Error("No deployment");
    await writeContractAsync({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "unpause",
    });
  };

  const recoverAirdrop = async (to: Address) => {
    if (!deployment) throw new Error("No deployment");
    await writeContractAsync({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "recoverUnclaimed",
      args: [to],
    });
  };

  const setVaultKeeper = async (keeper: Address) => {
    if (!vaultAddress) throw new Error("No vault");
    await writeContractAsync({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "setKeeper",
      args: [keeper],
    });
  };

  const setOperatorWallet = async (wallet: Address) => {
    if (!vaultAddress) throw new Error("No vault");
    await writeContractAsync({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "setOperatorWallet",
      args: [wallet],
    });
  };

  const pullPendingRewards = async (to: Address, amountUsdc: string) => {
    if (!vaultAddress) throw new Error("No vault");
    const amount = parseUnits(amountUsdc, 6);
    await writeContractAsync({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "pullPendingRewards",
      args: [to, amount],
    });
  };

  const harvestFees = async () => {
    if (!vaultAddress) throw new Error("No vault");
    await writeContractAsync({
      address: vaultAddress,
      abi: abis.vault,
      functionName: "harvestFees",
    });
  };

  const generateAndSetRoot = async (csv: string, deadlineDays: number) => {
    const entries: AirdropEntry[] = parseAirdropCsv(csv);
    const root = buildMerkleRoot(entries);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineDays * 86400);
    await setMerkleRoot(root, deadline);
    return root;
  };

  return {
    setMerkleRoot,
    fundAirdrop,
    pauseAirdrop,
    unpauseAirdrop,
    recoverAirdrop,
    setVaultKeeper,
    setOperatorWallet,
    pullPendingRewards,
    harvestFees,
    generateAndSetRoot,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
  };
}
