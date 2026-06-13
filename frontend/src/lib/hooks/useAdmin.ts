"use client";

import { useMemo } from "react";
import { useConnection, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address, parseUnits } from "viem";
import { abis, getDeployment } from "@/lib/contracts";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import MerkleAirdropAbi from "@/lib/contracts/abis/MerkleAirdrop.json";
import ownableAbi from "@/lib/contracts/ownableAbi.json";
import { buildMerkleRoot, parseAirdropCsv, type AirdropEntry } from "@/lib/admin/merkle";

export function useAdminAuth() {
  const { address, isConnected } = useConnection();
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);

  const { data: pointsOwner } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: ownableAbi,
    functionName: "owner",
    query: { enabled: !!deployment },
  });

  const { data: airdropOwner } = useReadContract({
    address: deployment?.airdrop,
    abi: ownableAbi,
    functionName: "owner",
    query: { enabled: !!deployment },
  });

  const { data: feeToSetter } = useReadContract({
    address: deployment?.factory,
    abi: abis.factory,
    functionName: "feeToSetter",
    query: { enabled: !!deployment },
  });

  const roles = useMemo(() => {
    if (!address) return { isAdmin: false, isPointsOwner: false, isAirdropOwner: false, isFactoryAdmin: false };
    const a = address.toLowerCase();
    const isPointsOwner = pointsOwner ? (pointsOwner as string).toLowerCase() === a : false;
    const isAirdropOwner = airdropOwner ? (airdropOwner as string).toLowerCase() === a : false;
    const isFactoryAdmin = feeToSetter ? (feeToSetter as string).toLowerCase() === a : false;
    return {
      isAdmin: isPointsOwner || isAirdropOwner || isFactoryAdmin,
      isPointsOwner,
      isAirdropOwner,
      isFactoryAdmin,
    };
  }, [address, pointsOwner, airdropOwner, feeToSetter]);

  return { ...roles, isConnected, address, deployment, pointsOwner, airdropOwner, feeToSetter };
}

export function useAdminAnalytics() {
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);

  const { data: reserves } = useReadContract({
    address: deployment?.pair,
    abi: abis.pair,
    functionName: "getReserves",
    query: { enabled: !!deployment, refetchInterval: 10_000 },
  });

  const { data: pairsLen } = useReadContract({
    address: deployment?.factory,
    abi: abis.factory,
    functionName: "allPairsLength",
    query: { enabled: !!deployment },
  });

  const { data: currentEpoch } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "currentEpoch",
    query: { enabled: !!deployment },
  });

  const { data: totalDistributed } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "totalPointsDistributed",
    query: { enabled: !!deployment },
  });

  const { data: epochFees } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "epochTotalFees",
    args: currentEpoch !== undefined ? [currentEpoch] : undefined,
    query: { enabled: !!deployment && currentEpoch !== undefined },
  });

  const { data: timeLeft } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "timeUntilNextEpoch",
    query: { enabled: !!deployment, refetchInterval: 5_000 },
  });

  const { data: airdropBalance } = useReadContract({
    address: deployment?.tokenUSDC,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: deployment?.airdrop ? [deployment.airdrop] : undefined,
    query: { enabled: !!deployment },
  });

  return { deployment, reserves, pairsLen, currentEpoch, totalDistributed, epochFees, timeLeft, airdropBalance };
}

export function useAdminActions() {
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createPair = async (tokenA: Address, tokenB: Address) => {
    if (!deployment) throw new Error("No deployment");
    await writeContractAsync({
      address: deployment.factory,
      abi: abis.factory,
      functionName: "createPair",
      args: [tokenA, tokenB],
    });
  };

  const authorizePool = async (pool: Address) => {
    if (!deployment) throw new Error("No deployment");
    await writeContractAsync({
      address: deployment.pointsDistributor,
      abi: abis.points,
      functionName: "authorizePool",
      args: [pool],
    });
  };

  const deauthorizePool = async (pool: Address) => {
    if (!deployment) throw new Error("No deployment");
    await writeContractAsync({
      address: deployment.pointsDistributor,
      abi: abis.points,
      functionName: "deauthorizePool",
      args: [pool],
    });
  };

  const syncPairs = async (start: number, end: number) => {
    if (!deployment) throw new Error("No deployment");
    await writeContractAsync({
      address: deployment.factory,
      abi: abis.factory,
      functionName: "syncPairs",
      args: [BigInt(start), BigInt(end)],
    });
  };

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

  const generateAndSetRoot = async (csv: string, deadlineDays: number) => {
    const entries: AirdropEntry[] = parseAirdropCsv(csv);
    const root = buildMerkleRoot(entries);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineDays * 86400);
    await setMerkleRoot(root, deadline);
    return root;
  };

  return {
    createPair,
    authorizePool,
    deauthorizePool,
    syncPairs,
    setMerkleRoot,
    fundAirdrop,
    generateAndSetRoot,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
  };
}
