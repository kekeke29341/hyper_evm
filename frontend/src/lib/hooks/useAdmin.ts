"use client";

import { useMemo } from "react";
import { useConnection, useReadContract } from "wagmi";
import { type Address } from "viem";
import { abis, getDeployment, getVaultAddress } from "@/lib/contracts";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import MerkleAirdropAbi from "@/lib/contracts/abis/MerkleAirdrop.json";
import ownableAbi from "@/lib/contracts/ownableAbi.json";
import { deviationSeverity, isTickInRange, priceDeviationBps } from "@/lib/admin/health";
import { npmPositionsAbi, poolSlot0Abi } from "@/lib/admin/minimalAbis";
import { PROJECT_X_POOL } from "@/lib/constants";

function walletMatches(address: string | undefined, onChain: unknown): boolean {
  if (!address || !onChain) return false;
  return (onChain as string).toLowerCase() === address.toLowerCase();
}

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

  const { data: adapterOwner } = useReadContract({
    address: deployment?.projectXAdapter,
    abi: ownableAbi,
    functionName: "owner",
    query: { enabled: !!deployment?.projectXAdapter },
  });

  const { data: vaultKeeperOnChain } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "keeper",
    query: { enabled: !!vaultAddress },
  });

  const roles = useMemo(() => {
    const isAirdropOwner = walletMatches(address, airdropOwner);
    const isVaultOwner = walletMatches(address, vaultOwner);
    const isAdapterOwner = walletMatches(address, adapterOwner);
    const isKeeper = walletMatches(address, vaultKeeperOnChain);
    const isAdmin = isAirdropOwner || isVaultOwner;
    const canRunKeeper = isVaultOwner || isKeeper;
    const canWrite = isAdmin;
    return {
      isAdmin,
      isAirdropOwner,
      isVaultOwner,
      isAdapterOwner,
      isKeeper,
      canRunKeeper,
      canWrite,
    };
  }, [address, airdropOwner, vaultOwner, adapterOwner, vaultKeeperOnChain]);

  return {
    ...roles,
    isConnected,
    address,
    deployment,
    vaultAddress,
    airdropOwner,
    vaultOwner,
    adapterOwner,
    vaultKeeper: vaultKeeperOnChain,
  };
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

  const { data: ownerFeeBps } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "ownerFeeBps",
    query: { enabled: !!vaultAddress },
  });

  const { data: ownerFeeWallet } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "ownerFeeWallet",
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

  const { data: vaultPaused } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "paused",
    query: { enabled: !!vaultAddress, refetchInterval: 10_000 },
  });

  const { data: maxRebalanceDeviationBps } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "maxRebalanceDeviationBps",
    query: { enabled: !!vaultAddress },
  });

  const { data: convertHypeFeesToUsdc } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "convertHypeFeesToUsdc",
    query: { enabled: !!vaultAddress },
  });

  const { data: feeSwapSlippageBps } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "feeSwapSlippageBps",
    query: { enabled: !!vaultAddress },
  });

  const { data: swapRouter } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "swapRouter",
    query: { enabled: !!vaultAddress },
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
    ownerFeeBps,
    ownerFeeWallet,
    vaultKeeper,
    airdropPaused,
    vaultPaused,
    maxRebalanceDeviationBps,
    convertHypeFeesToUsdc,
    feeSwapSlippageBps,
    swapRouter,
  };
}

export function useAdminHealth() {
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);
  const vaultAddress = deployment ? getVaultAddress(deployment) : undefined;
  const adapter = deployment?.projectXAdapter;
  const pool = deployment?.projectXPool ?? PROJECT_X_POOL.poolAddress;
  const npm = deployment?.projectXNpm;

  const { data: oraclePrice } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "oraclePriceUsdc6PerHype18",
    query: { enabled: !!vaultAddress, refetchInterval: 30_000 },
  });

  const { data: poolPrice } = useReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "currentPoolPriceUsdc6PerHype18",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const { data: refPrice } = useReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "refPriceUsdc6PerHype18",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const { data: positionTokenId } = useReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "positionTokenId",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const { data: tickLower } = useReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "tickLower",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const { data: tickUpper } = useReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "tickUpper",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const { data: adapterVault } = useReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "vault",
    query: { enabled: !!adapter },
  });

  const { data: slot0 } = useReadContract({
    address: pool as Address | undefined,
    abi: poolSlot0Abi,
    functionName: "slot0",
    query: { enabled: !!pool, refetchInterval: 30_000 },
  });

  const tokenId = positionTokenId !== undefined ? (positionTokenId as bigint) : undefined;
  const hasPosition = tokenId !== undefined && tokenId > 0n;

  const { data: npmPosition } = useReadContract({
    address: npm as Address | undefined,
    abi: npmPositionsAbi,
    functionName: "positions",
    args: hasPosition ? [tokenId] : undefined,
    query: { enabled: !!npm && hasPosition, refetchInterval: 30_000 },
  });

  const { data: maxRebalanceDeviationBps } = useReadContract({
    address: vaultAddress,
    abi: abis.vault,
    functionName: "maxRebalanceDeviationBps",
    query: { enabled: !!vaultAddress },
  });

  const { data: distributionExecuted } = useReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "distributionExecuted",
    args: deployment?.lastCashdropDistribution?.distributionId
      ? [deployment.lastCashdropDistribution.distributionId as `0x${string}`]
      : undefined,
    query: {
      enabled: !!deployment?.airdrop && !!deployment.lastCashdropDistribution?.distributionId,
    },
  });

  const maxDevBps = maxRebalanceDeviationBps !== undefined ? Number(maxRebalanceDeviationBps) : 500;
  const oraclePoolDevBps = priceDeviationBps(
    oraclePrice as bigint | undefined ?? 0n,
    poolPrice as bigint | undefined ?? 0n
  );
  const oracleRefDevBps = priceDeviationBps(
    oraclePrice as bigint | undefined ?? 0n,
    refPrice as bigint | undefined ?? 0n
  );

  const currentTick =
    slot0 !== undefined ? Number((slot0 as readonly [bigint, number, ...unknown[]])[1]) : null;
  const lower = tickLower !== undefined ? Number(tickLower) : null;
  const upper = tickUpper !== undefined ? Number(tickUpper) : null;
  const inRange =
    currentTick !== null && lower !== null && upper !== null
      ? isTickInRange(currentTick, lower, upper)
      : null;

  const npmLiquidity =
    npmPosition !== undefined ? (npmPosition as readonly unknown[])[7] as bigint : undefined;

  const vaultLinkOk =
    vaultAddress && adapterVault
      ? (adapterVault as string).toLowerCase() === vaultAddress.toLowerCase()
      : null;

  const usingFallbackRef = refPrice !== undefined && (refPrice as bigint) > 0n && (poolPrice as bigint | undefined ?? 0n) === 0n;

  return {
    deployment,
    oraclePrice: oraclePrice as bigint | undefined,
    poolPrice: poolPrice as bigint | undefined,
    refPrice: refPrice as bigint | undefined,
    positionTokenId: tokenId,
    tickLower: lower,
    tickUpper: upper,
    currentTick,
    inRange,
    npmLiquidity,
    oraclePoolDevBps,
    oracleRefDevBps,
    maxDevBps,
    oraclePoolSeverity: deviationSeverity(oraclePoolDevBps, maxDevBps),
    vaultLinkOk,
    usingFallbackRef,
    distributionExecuted: distributionExecuted as boolean | undefined,
  };
}
