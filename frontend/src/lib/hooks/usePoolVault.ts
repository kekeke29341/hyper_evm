"use client";

import { useCallback, useState } from "react";
import {
  useConnection,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { abis } from "@/lib/contracts";
import { ensureExactAllowance } from "@/lib/erc20";
import { usePoolContext } from "@/lib/pools/PoolContext";
import { formatQuotePerBase, formatTokenAmount } from "@/lib/pools/format";

function usePoolReadContract(config: Parameters<typeof useReadContract>[0]) {
  const { chainId } = usePoolContext();
  return useReadContract({ ...config, chainId });
}

export function usePoolTokenBalance(token: `0x${string}` | undefined, decimals: number) {
  const { address } = useConnection();

  const { data, refetch, isLoading } = usePoolReadContract({
    address: token,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!token, refetchInterval: 15_000 },
  });

  const raw = data as bigint | undefined;
  return {
    raw,
    formatted: raw !== undefined ? formatTokenAmount(raw, decimals) : "0",
    refetch,
    isLoading,
  };
}

export function usePoolStats() {
  const { pool } = usePoolContext();
  const shareDecimals = pool.quoteDecimals;

  const { data: totalAssetsRaw, refetch: refetchAssets } = usePoolReadContract({
    address: pool.vault,
    abi: abis.vault,
    functionName: "totalAssetsUsdc",
    query: { refetchInterval: 15_000 },
  });

  const { data: totalSupplyRaw, refetch: refetchSupply } = usePoolReadContract({
    address: pool.vault,
    abi: abis.vault,
    functionName: "totalSupply",
    query: { refetchInterval: 15_000 },
  });

  const { data: pendingRewards } = usePoolReadContract({
    address: pool.vault,
    abi: abis.vault,
    functionName: "pendingUserRewards",
    query: { refetchInterval: 15_000 },
  });

  const { data: priceRaw, isFetching: priceLoading } = usePoolReadContract({
    address: pool.adapter,
    abi: abis.adapter,
    functionName: "currentPoolPriceUsdc6PerHype18",
    query: { refetchInterval: 30_000 },
  });

  const { data: tickLower } = usePoolReadContract({
    address: pool.adapter,
    abi: abis.adapter,
    functionName: "tickLower",
    query: { refetchInterval: 60_000 },
  });

  const { data: tickUpper } = usePoolReadContract({
    address: pool.adapter,
    abi: abis.adapter,
    functionName: "tickUpper",
    query: { refetchInterval: 60_000 },
  });

  const { data: positionTokenId } = usePoolReadContract({
    address: pool.adapter,
    abi: abis.adapter,
    functionName: "positionTokenId",
    query: { refetchInterval: 30_000 },
  });

  const totalAssets =
    totalAssetsRaw !== undefined
      ? parseFloat(formatUnits(totalAssetsRaw as bigint, pool.quoteDecimals))
      : 0;
  const totalSupply =
    totalSupplyRaw !== undefined ? formatUnits(totalSupplyRaw as bigint, shareDecimals) : "0";
  const price = priceRaw as bigint | undefined;

  return {
    totalAssets,
    totalAssetsRaw: totalAssetsRaw as bigint | undefined,
    totalSupply,
    totalSupplyFloat: parseFloat(totalSupply) || 0,
    pendingRewardsRaw: pendingRewards as bigint | undefined,
    priceRaw: price,
    priceLabel: price ? formatQuotePerBase(price, pool) : "—",
    priceLoading,
    tickLower: tickLower !== undefined ? Number(tickLower) : null,
    tickUpper: tickUpper !== undefined ? Number(tickUpper) : null,
    hasLpPosition: (positionTokenId as bigint | undefined) !== undefined && (positionTokenId as bigint) > 0n,
    refetch: () => {
      refetchAssets();
      refetchSupply();
    },
  };
}

export function usePoolVaultBalance() {
  const { pool } = usePoolContext();
  const { address } = useConnection();
  const stats = usePoolStats();
  const shareDecimals = pool.quoteDecimals;

  const { data, refetch, isLoading } = usePoolReadContract({
    address: pool.vault,
    abi: abis.vault,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const sharesRaw = data as bigint | undefined;
  const shares =
    sharesRaw !== undefined ? formatUnits(sharesRaw, shareDecimals) : "0";
  const userShares = parseFloat(shares) || 0;
  const shareFraction =
    stats.totalSupplyFloat > 0 ? userShares / stats.totalSupplyFloat : 0;
  const valueQuote = stats.totalAssets * shareFraction;

  return {
    shares,
    sharesRaw,
    valueQuote,
    hasPosition: sharesRaw !== undefined && sharesRaw > 0n,
    isLoading: !!address && isLoading,
    refetch,
  };
}

export type PoolDepositSide = "quote" | "base";

export function usePoolDeposit() {
  const { pool, chainId } = usePoolContext();
  const { address } = useConnection();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync, isPending } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const deposit = useCallback(
    async (side: PoolDepositSide, amount: string) => {
      if (!address || !publicClient) throw new Error("Wallet not connected");
      setError(null);
      setHash(undefined);
      setIsSuccess(false);
      setIsConfirming(true);

      try {
        const isQuote = side === "quote";
        const token = isQuote ? pool.quoteToken : pool.baseToken;
        const decimals = isQuote ? pool.quoteDecimals : pool.baseDecimals;
        const fn = isQuote ? "depositUSDC" : "depositHYPE";
        const amountIn = parseUnits(amount, decimals);

        await ensureExactAllowance(
          publicClient,
          writeContractAsync,
          token,
          abis.erc20,
          address,
          pool.vault,
          amountIn,
          chainId
        );

        const txHash = await writeContractAsync({
          address: pool.vault,
          abi: abis.vault,
          functionName: fn,
          args: [amountIn, address],
          chainId,
        });
        setHash(txHash);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        setIsSuccess(true);
        return txHash;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Deposit failed";
        setError(msg);
        throw e;
      } finally {
        setIsConfirming(false);
      }
    },
    [address, chainId, pool, publicClient, writeContractAsync]
  );

  return {
    deposit,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function usePoolWithdraw() {
  const { pool, chainId } = usePoolContext();
  const { address } = useConnection();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const shareDecimals = pool.quoteDecimals;

  const withdraw = useCallback(
    async (shares: string) => {
      if (!address || !publicClient) throw new Error("Wallet not connected");
      const shareAmount = parseUnits(shares, shareDecimals);
      await writeContractAsync({
        address: pool.vault,
        abi: abis.vault,
        functionName: "withdraw",
        args: [shareAmount, address],
        chainId,
      });
    },
    [address, chainId, pool.vault, publicClient, shareDecimals, writeContractAsync]
  );

  return { withdraw, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useWrapNativeHype() {
  const { pool, chainId } = usePoolContext();
  const { address } = useConnection();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isConfirming, setIsConfirming] = useState(false);

  const wrap = useCallback(
    async (amountHype: string) => {
      if (!address || !publicClient) throw new Error("Wallet not connected");
      setIsConfirming(true);
      try {
        const value = parseUnits(amountHype, 18);
        const txHash = await writeContractAsync({
          address: pool.quoteToken,
          abi: [
            {
              name: "deposit",
              type: "function",
              stateMutability: "payable",
              inputs: [],
              outputs: [],
            },
          ],
          functionName: "deposit",
          value,
          chainId,
        });
        setHash(txHash);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        return txHash;
      } finally {
        setIsConfirming(false);
      }
    },
    [address, chainId, pool.quoteToken, publicClient, writeContractAsync]
  );

  return { wrap, isPending: isPending || isConfirming, hash };
}

export function usePoolVaultLive(): boolean {
  const { pool } = usePoolContext();
  return !!pool.vault && pool.vault !== zeroAddress;
}
