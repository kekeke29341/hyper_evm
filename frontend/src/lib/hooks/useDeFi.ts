"use client";

import { useCallback, useState, useMemo } from "react";
import {
  useConnection,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, zeroAddress } from "viem";
import {
  abis,
  getDeployment,
  getTokenAddress,
  getTokenDecimals,
  type TokenSymbol,
} from "@/lib/contracts";
import { getMerkleProof } from "@/lib/admin/merkle";
import MerkleAirdropAbi from "@/lib/contracts/abis/MerkleAirdrop.json";
import { ensureExactAllowance } from "@/lib/erc20";
import { getSlippageBps } from "@/components/layout/SettingsModal";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";

export function useDeployment() {
  return getDeployment(useEffectiveChainId());
}

/** Align contract reads with deployment chain (avoids stale wagmi chainId when disconnected). */
function useDeploymentReadChainId() {
  return useEffectiveChainId();
}

function useDeploymentReadContract(
  config: Parameters<typeof useReadContract>[0]
) {
  const chainId = useDeploymentReadChainId();
  return useReadContract({ ...config, chainId });
}

function useDeploymentPublicClient() {
  const chainId = useDeploymentReadChainId();
  return usePublicClient({ chainId });
}

function applySlippage(amount: bigint, slippageBps: number) {
  return (amount * BigInt(10000 - slippageBps)) / BigInt(10000);
}

async function getPoolTokenBreakdown(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  deployment: NonNullable<ReturnType<typeof useDeployment>>,
  liquidity: bigint
) {
  const [reserve0, reserve1] = (await publicClient.readContract({
    address: deployment.pair,
    abi: abis.pair,
    functionName: "getReserves",
  })) as [bigint, bigint];

  const totalSupply = (await publicClient.readContract({
    address: deployment.pair,
    abi: abis.erc20,
    functionName: "totalSupply",
  })) as bigint;

  const token0 = (await publicClient.readContract({
    address: deployment.pair,
    abi: abis.pair,
    functionName: "token0",
  })) as `0x${string}`;

  const reserveKhype = token0.toLowerCase() === deployment.tokenKHYPE.toLowerCase() ? reserve0 : reserve1;
  const reserveUsdc = token0.toLowerCase() === deployment.tokenKHYPE.toLowerCase() ? reserve1 : reserve0;

  return {
    khype: (liquidity * reserveKhype) / totalSupply,
    usdc: (liquidity * reserveUsdc) / totalSupply,
  };
}

export function useTokenBalance(symbol: TokenSymbol) {
  const { address } = useConnection();
  const deployment = useDeployment();
  const token = deployment ? getTokenAddress(deployment, symbol) : undefined;

  const { data, refetch } = useDeploymentReadContract({
    address: token,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!token },
  });

  const formatted =
    data !== undefined ? formatUnits(data as bigint, getTokenDecimals(symbol)) : "0.00";

  return { balance: formatted, raw: data as bigint | undefined, refetch };
}

export function useSwapQuote(fromSymbol: TokenSymbol, toSymbol: TokenSymbol, amountIn: string) {
  const deployment = useDeployment();
  const from = deployment ? getTokenAddress(deployment, fromSymbol) : undefined;
  const to = deployment ? getTokenAddress(deployment, toSymbol) : undefined;

  let parsedIn: bigint | undefined;
  try {
    parsedIn =
      amountIn && parseFloat(amountIn) > 0
        ? parseUnits(amountIn, getTokenDecimals(fromSymbol))
        : undefined;
  } catch {
    parsedIn = undefined;
  }

  const { data: amounts } = useDeploymentReadContract({
    address: deployment?.router,
    abi: abis.router,
    functionName: "getAmountsOut",
    args: parsedIn && from && to ? [parsedIn, [from, to]] : undefined,
    query: { enabled: !!deployment && !!parsedIn && !!from && !!to },
  });

  const amountOut =
    amounts && Array.isArray(amounts) && amounts.length > 1
      ? formatUnits(amounts[1] as bigint, getTokenDecimals(toSymbol))
      : "";

  return { amountOut, amountsOut: amounts as bigint[] | undefined };
}

export function useSwap(fromSymbol: TokenSymbol, toSymbol: TokenSymbol) {
  const { address } = useConnection();
  const deployment = useDeployment();
  const publicClient = useDeploymentPublicClient();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [error, setError] = useState<string | null>(null);

  const swap = useCallback(
    async (amountIn: string, slippageBps = 50) => {
      if (!deployment || !address || !publicClient) throw new Error("Wallet not connected");
      setError(null);
      try {
        const from = getTokenAddress(deployment, fromSymbol);
        const to = getTokenAddress(deployment, toSymbol);
        const amountInWei = parseUnits(amountIn, getTokenDecimals(fromSymbol));

        const amounts = (await publicClient.readContract({
          address: deployment.router,
          abi: abis.router,
          functionName: "getAmountsOut",
          args: [amountInWei, [from, to]],
        })) as bigint[];

        const out = amounts[1];
        const amountOutMin = (out * BigInt(10000 - slippageBps)) / BigInt(10000);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

        await ensureExactAllowance(
          publicClient,
          writeContractAsync,
          from,
          abis.erc20,
          address,
          deployment.router,
          amountInWei
        );

        await writeContractAsync({
          address: deployment.router,
          abi: abis.router,
          functionName: "swapExactTokensForTokens",
          args: [amountInWei, amountOutMin, [from, to], address, deadline],
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Swap failed";
        setError(msg);
        throw e;
      }
    },
    [deployment, address, publicClient, fromSymbol, toSymbol, writeContractAsync]
  );

  return { swap, isPending: isPending || isConfirming, isSuccess, error, hash };
}

export function useAddLiquidity() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const publicClient = useDeploymentPublicClient();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addLiquidity = useCallback(
    async (amountKHYPE: string, amountUSDC: string) => {
      if (!deployment || !address || !publicClient) throw new Error("Wallet not connected");
      const khype = deployment.tokenKHYPE;
      const usdc = deployment.tokenUSDC;
      const a = parseUnits(amountKHYPE, 18);
      const b = parseUnits(amountUSDC, 6);
      const slippageBps = getSlippageBps();
      const aMin = (a * BigInt(10000 - slippageBps)) / BigInt(10000);
      const bMin = (b * BigInt(10000 - slippageBps)) / BigInt(10000);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      for (const [token, amount] of [
        [khype, a],
        [usdc, b],
      ] as const) {
        await ensureExactAllowance(
          publicClient,
          writeContractAsync,
          token,
          abis.erc20,
          address,
          deployment.router,
          amount
        );
      }

      await writeContractAsync({
        address: deployment.router,
        abi: abis.router,
        functionName: "addLiquidity",
        args: [khype, usdc, a, b, aMin, bMin, address, deadline],
      });
    },
    [deployment, address, publicClient, writeContractAsync]
  );

  return { addLiquidity, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useRemoveLiquidity() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const publicClient = useDeploymentPublicClient();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const removeLiquidity = useCallback(
    async (lpAmount: string) => {
      if (!deployment || !address || !publicClient) throw new Error("Wallet not connected");
      const khype = deployment.tokenKHYPE;
      const usdc = deployment.tokenUSDC;
      const liquidity = parseUnits(lpAmount, 18);
      const slippageBps = getSlippageBps();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      const expected = await getPoolTokenBreakdown(publicClient, deployment, liquidity);
      const khypeMin = applySlippage(expected.khype, slippageBps);
      const usdcMin = applySlippage(expected.usdc, slippageBps);

      await ensureExactAllowance(
        publicClient,
        writeContractAsync,
        deployment.pair,
        abis.erc20,
        address,
        deployment.router,
        liquidity
      );

      await writeContractAsync({
        address: deployment.router,
        abi: abis.router,
        functionName: "removeLiquidity",
        args: [khype, usdc, liquidity, khypeMin, usdcMin, address, deadline],
      });
    },
    [deployment, address, publicClient, writeContractAsync]
  );

  return { removeLiquidity, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useEnterInvitationCode() {
  const deployment = useDeployment();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enterCode = useCallback(
    async (code: `0x${string}`) => {
      if (!deployment) throw new Error("Contracts not deployed on this network");
      await writeContractAsync({
        address: deployment.referralRegistry,
        abi: abis.referral,
        functionName: "enterInvitationCode",
        args: [code],
      });
    },
    [deployment, writeContractAsync]
  );

  return { enterCode, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useRegisterReferralCode() {
  const deployment = useDeployment();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const registerCode = useCallback(
    async (code: `0x${string}`) => {
      if (!deployment) throw new Error("Contracts not deployed on this network");
      await writeContractAsync({
        address: deployment.referralRegistry,
        abi: abis.referral,
        functionName: "registerCode",
        args: [code],
      });
    },
    [deployment, writeContractAsync]
  );

  return { registerCode, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useOnChainPoints() {
  const { address } = useConnection();
  const deployment = useDeployment();

  const { data, refetch } = useDeploymentReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "getUserPoints",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!deployment, refetchInterval: 5000 },
  });

  return {
    points: data !== undefined ? Number(formatUnits(data as bigint, 18)) : null,
    refetch,
    hasDeployment: !!deployment,
  };
}

export function usePoolReserves() {
  const deployment = useDeployment();
  const { data } = useDeploymentReadContract({
    address: deployment?.pair,
    abi: abis.pair,
    functionName: "getReserves",
    query: { enabled: !!deployment, refetchInterval: 10000 },
  });

  if (!data || !Array.isArray(data)) return null;
  return {
    reserveKHYPE: formatUnits(data[0] as bigint, 18),
    reserveUSDC: formatUnits(data[1] as bigint, 6),
    rawReserve0: data[0] as bigint,
    rawReserve1: data[1] as bigint,
  };
}

export function usePoolStats() {
  const deployment = useDeployment();
  const reserves = usePoolReserves();

  const { data: totalSupply } = useDeploymentReadContract({
    address: deployment?.pair,
    abi: abis.erc20,
    functionName: "totalSupply",
    query: { enabled: !!deployment, refetchInterval: 10000 },
  });

  const { data: token0 } = useDeploymentReadContract({
    address: deployment?.pair,
    abi: abis.pair,
    functionName: "token0",
    query: { enabled: !!deployment },
  });

  const supply = totalSupply !== undefined ? formatUnits(totalSupply as bigint, 18) : "0";
  const supplyRaw = totalSupply as bigint | undefined;

  let reserveKhype = reserves ? parseFloat(reserves.reserveKHYPE) : 0;
  let reserveUsdc = reserves ? parseFloat(reserves.reserveUSDC) : 0;

  if (reserves && token0 && deployment) {
    const t0 = token0 as string;
    if (t0.toLowerCase() !== deployment.tokenKHYPE.toLowerCase()) {
      reserveKhype = parseFloat(reserves.reserveUSDC);
      reserveUsdc = parseFloat(reserves.reserveKHYPE);
    }
  }

  return {
    reserveKhype,
    reserveUsdc,
    totalSupply: parseFloat(supply),
    totalSupplyRaw: supplyRaw,
    hasDeployment: !!deployment,
  };
}

export function useZapLiquidity() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const publicClient = useDeploymentPublicClient();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [error, setError] = useState<string | null>(null);

  const zap = useCallback(
    async (source: "kHYPE" | "USDC", totalAmount: string) => {
      if (!deployment || !address || !publicClient) throw new Error("Wallet not connected");
      setError(null);

      const khype = deployment.tokenKHYPE;
      const usdc = deployment.tokenUSDC;
      const slippageBps = getSlippageBps();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const total = parseFloat(totalAmount);
      if (!total || total <= 0) throw new Error("Invalid amount");

      try {
        if (deployment.liquidityVault) {
          const tokenIn = source === "USDC" ? usdc : khype;
          const decimals = source === "USDC" ? 6 : 18;
          const amountIn = parseUnits(totalAmount, decimals);
          const swapAmount = amountIn / BigInt(2);
          const keepAmount = amountIn - swapAmount;
          const path = source === "USDC" ? [usdc, khype] : [khype, usdc];
          const amounts = (await publicClient.readContract({
            address: deployment.router,
            abi: abis.router,
            functionName: "getAmountsOut",
            args: [swapAmount, path],
          })) as bigint[];
          const amountOutMin = applySlippage(amounts[1], slippageBps);
          const expectedKhype = source === "USDC" ? amounts[1] : keepAmount;
          const expectedUsdc = source === "USDC" ? keepAmount : amounts[1];
          const khypeMin = applySlippage(expectedKhype, slippageBps);
          const usdcMin = applySlippage(expectedUsdc, slippageBps);

          await ensureExactAllowance(
            publicClient,
            writeContractAsync,
            tokenIn,
            abis.erc20,
            address,
            deployment.liquidityVault,
            amountIn
          );

          await writeContractAsync({
            address: deployment.liquidityVault,
            abi: abis.liquidityVault,
            functionName: "depositSingle",
            args: [tokenIn, amountIn, amountOutMin, khypeMin, usdcMin, address, deadline],
          });
          return;
        }

        if (source === "USDC") {
          const swapAmount = total / 2;
          const swapWei = parseUnits(String(swapAmount), 6);
          const amounts = (await publicClient.readContract({
            address: deployment.router,
            abi: abis.router,
            functionName: "getAmountsOut",
            args: [swapWei, [usdc, khype]],
          })) as bigint[];
          const khypeOut = amounts[1];
          const khypeOutMin = (khypeOut * BigInt(10000 - slippageBps)) / BigInt(10000);

          await ensureExactAllowance(
            publicClient,
            writeContractAsync,
            usdc,
            abis.erc20,
            address,
            deployment.router,
            swapWei
          );

          const swapHash = await writeContractAsync({
            address: deployment.router,
            abi: abis.router,
            functionName: "swapExactTokensForTokens",
            args: [swapWei, khypeOutMin, [usdc, khype], address, deadline],
          });
          await publicClient.waitForTransactionReceipt({ hash: swapHash });

          const khypeAmount = formatUnits(khypeOut, 18);
          const usdcKeep = String(swapAmount);
          const a = parseUnits(khypeAmount, 18);
          const b = parseUnits(usdcKeep, 6);
          const aMin = (a * BigInt(10000 - slippageBps)) / BigInt(10000);
          const bMin = (b * BigInt(10000 - slippageBps)) / BigInt(10000);

          await ensureExactAllowance(
            publicClient,
            writeContractAsync,
            khype,
            abis.erc20,
            address,
            deployment.router,
            a
          );
          await ensureExactAllowance(
            publicClient,
            writeContractAsync,
            usdc,
            abis.erc20,
            address,
            deployment.router,
            b
          );

          await writeContractAsync({
            address: deployment.router,
            abi: abis.router,
            functionName: "addLiquidity",
            args: [khype, usdc, a, b, aMin, bMin, address, deadline],
          });
        } else {
          const swapAmount = total / 2;
          const swapWei = parseUnits(String(swapAmount), 18);
          const amounts = (await publicClient.readContract({
            address: deployment.router,
            abi: abis.router,
            functionName: "getAmountsOut",
            args: [swapWei, [khype, usdc]],
          })) as bigint[];
          const usdcOut = amounts[1];
          const usdcOutMin = (usdcOut * BigInt(10000 - slippageBps)) / BigInt(10000);

          await ensureExactAllowance(
            publicClient,
            writeContractAsync,
            khype,
            abis.erc20,
            address,
            deployment.router,
            swapWei
          );

          const swapHash = await writeContractAsync({
            address: deployment.router,
            abi: abis.router,
            functionName: "swapExactTokensForTokens",
            args: [swapWei, usdcOutMin, [khype, usdc], address, deadline],
          });
          await publicClient.waitForTransactionReceipt({ hash: swapHash });

          const usdcAmount = formatUnits(usdcOut, 6);
          const khypeKeep = String(swapAmount);
          const a = parseUnits(khypeKeep, 18);
          const b = parseUnits(usdcAmount, 6);
          const aMin = (a * BigInt(10000 - slippageBps)) / BigInt(10000);
          const bMin = (b * BigInt(10000 - slippageBps)) / BigInt(10000);

          await ensureExactAllowance(
            publicClient,
            writeContractAsync,
            khype,
            abis.erc20,
            address,
            deployment.router,
            a
          );
          await ensureExactAllowance(
            publicClient,
            writeContractAsync,
            usdc,
            abis.erc20,
            address,
            deployment.router,
            b
          );

          await writeContractAsync({
            address: deployment.router,
            abi: abis.router,
            functionName: "addLiquidity",
            args: [khype, usdc, a, b, aMin, bMin, address, deadline],
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Zap failed";
        setError(msg);
        throw e;
      }
    },
    [deployment, address, publicClient, writeContractAsync]
  );

  return {
    zap,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
    hash,
  };
}

export function useLpBalance() {
  const { address } = useConnection();
  const deployment = useDeployment();

  const { data, refetch } = useDeploymentReadContract({
    address: deployment?.pair,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!deployment, refetchInterval: 10000 },
  });

  const balance = data !== undefined ? formatUnits(data as bigint, 18) : "0";
  const hasPosition = data !== undefined && (data as bigint) > BigInt(0);

  return { balance, hasPosition, refetch };
}

export function useVaultStats() {
  const deployment = useDeployment();
  const { reserveKhype, reserveUsdc, totalSupply } = usePoolStats();

  const { data: vaultLp, refetch: refetchVaultLp } = useDeploymentReadContract({
    address: deployment?.pair,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: deployment?.liquidityVault ? [deployment.liquidityVault] : undefined,
    query: { enabled: !!deployment?.liquidityVault, refetchInterval: 10000 },
  });

  const { data: vaultShareSupply, refetch: refetchShareSupply } = useDeploymentReadContract({
    address: deployment?.liquidityVault,
    abi: abis.liquidityVault,
    functionName: "totalSupply",
    query: { enabled: !!deployment?.liquidityVault, refetchInterval: 10000 },
  });

  const { data: targetRangeBps } = useDeploymentReadContract({
    address: deployment?.liquidityVault,
    abi: abis.liquidityVault,
    functionName: "targetRangeBps",
    query: { enabled: !!deployment?.liquidityVault, refetchInterval: 30000 },
  });

  const vaultLpFloat = vaultLp !== undefined ? parseFloat(formatUnits(vaultLp as bigint, 18)) : 0;
  const shareSupply = vaultShareSupply !== undefined ? formatUnits(vaultShareSupply as bigint, 18) : "0";
  const shareSupplyFloat = parseFloat(shareSupply);
  const lpShare = totalSupply > 0 ? vaultLpFloat / totalSupply : 0;
  const vaultKhype = reserveKhype * lpShare;
  const vaultUsdc = reserveUsdc * lpShare;

  return {
    hasVault: !!deployment?.liquidityVault && deployment.liquidityVault !== zeroAddress,
    vaultAddress: deployment?.liquidityVault,
    vaultLp: vaultLpFloat,
    vaultLpRaw: vaultLp as bigint | undefined,
    shareSupply,
    shareSupplyFloat,
    vaultKhype,
    vaultUsdc,
    vaultTvlUsd: vaultUsdc * 2,
    targetRangeBps: targetRangeBps !== undefined ? Number(targetRangeBps) : 600,
    refetch: () => {
      refetchVaultLp();
      refetchShareSupply();
    },
  };
}

export function useVaultBalance() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const stats = useVaultStats();

  const { data, refetch } = useDeploymentReadContract({
    address: deployment?.liquidityVault,
    abi: abis.liquidityVault,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && stats.hasVault, refetchInterval: 10000 },
  });

  const sharesRaw = data as bigint | undefined;
  const shares = sharesRaw !== undefined ? formatUnits(sharesRaw, 18) : "0";
  const share = stats.shareSupplyFloat > 0 ? parseFloat(shares) / stats.shareSupplyFloat : 0;

  return {
    shares,
    sharesRaw,
    hasVaultPosition: sharesRaw !== undefined && sharesRaw > BigInt(0),
    khype: stats.vaultKhype * share,
    usdc: stats.vaultUsdc * share,
    valueUsd: stats.vaultTvlUsd * share,
    refetch,
  };
}

export function useVaultDepositDual() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const publicClient = useDeploymentPublicClient();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const depositDual = useCallback(
    async (amountKHYPE: string, amountUSDC: string) => {
      if (!deployment?.liquidityVault || !address || !publicClient) throw new Error("Vault unavailable");
      const khypeAmount = parseUnits(amountKHYPE, 18);
      const usdcAmount = parseUnits(amountUSDC, 6);
      const slippageBps = getSlippageBps();
      const khypeMin = (khypeAmount * BigInt(10000 - slippageBps)) / BigInt(10000);
      const usdcMin = (usdcAmount * BigInt(10000 - slippageBps)) / BigInt(10000);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      await ensureExactAllowance(
        publicClient,
        writeContractAsync,
        deployment.tokenKHYPE,
        abis.erc20,
        address,
        deployment.liquidityVault,
        khypeAmount
      );
      await ensureExactAllowance(
        publicClient,
        writeContractAsync,
        deployment.tokenUSDC,
        abis.erc20,
        address,
        deployment.liquidityVault,
        usdcAmount
      );

      await writeContractAsync({
        address: deployment.liquidityVault,
        abi: abis.liquidityVault,
        functionName: "depositDual",
        args: [khypeAmount, usdcAmount, khypeMin, usdcMin, address, deadline],
      });
    },
    [deployment, address, publicClient, writeContractAsync]
  );

  return { depositDual, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useVaultWithdraw() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const publicClient = useDeploymentPublicClient();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const withdraw = useCallback(
    async (shares: string) => {
      if (!deployment?.liquidityVault || !address || !publicClient) throw new Error("Vault unavailable");
      const shareAmount = parseUnits(shares, 18);
      const slippageBps = getSlippageBps();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      const [vaultLp, shareSupply] = await Promise.all([
        publicClient.readContract({
          address: deployment.pair,
          abi: abis.erc20,
          functionName: "balanceOf",
          args: [deployment.liquidityVault],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: deployment.liquidityVault,
          abi: abis.liquidityVault,
          functionName: "totalSupply",
        }) as Promise<bigint>,
      ]);
      const liquidity = (vaultLp * shareAmount) / shareSupply;
      const expected = await getPoolTokenBreakdown(publicClient, deployment, liquidity);
      const khypeMin = applySlippage(expected.khype, slippageBps);
      const usdcMin = applySlippage(expected.usdc, slippageBps);

      await writeContractAsync({
        address: deployment.liquidityVault,
        abi: abis.liquidityVault,
        functionName: "withdraw",
        args: [shareAmount, khypeMin, usdcMin, address, deadline],
      });
    },
    [deployment, address, publicClient, writeContractAsync]
  );

  return { withdraw, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useEpochCountdown() {
  const deployment = useDeployment();

  const { data: secondsLeft } = useDeploymentReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "timeUntilNextEpoch",
    query: { enabled: !!deployment, refetchInterval: 5000 },
  });

  if (secondsLeft === undefined) return null;
  const total = Number(secondsLeft);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { h, m, s, formatted: `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s` };
}

export function useCashdrop() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { data: merkleRoot } = useDeploymentReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "merkleRoot",
    query: { enabled: !!deployment },
  });

  const { data: claimDeadline } = useDeploymentReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "claimDeadline",
    query: { enabled: !!deployment },
  });

  const { data: alreadyClaimed } = useDeploymentReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "claimed",
    args: address ? [address] : undefined,
    query: { enabled: !!deployment && !!address },
  });

  const { data: airdropBalance } = useDeploymentReadContract({
    address: deployment?.tokenUSDC,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: deployment?.airdrop ? [deployment.airdrop] : undefined,
    query: { enabled: !!deployment, refetchInterval: 10000 },
  });

  const claimable = useMemo(() => {
    if (!deployment?.airdropEntries || !address) return null;
    const entries = deployment.airdropEntries.map((e) => ({
      address: e.address,
      amount: BigInt(e.amount),
    }));
    return getMerkleProof(entries, address);
  }, [deployment, address]);

  const claim = useCallback(async () => {
    if (!deployment || !claimable) throw new Error("Nothing to claim");
    await writeContractAsync({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "claim",
      args: [claimable.amount, claimable.proof],
    });
  }, [deployment, claimable, writeContractAsync]);

  const rootSet =
    merkleRoot !== undefined &&
    (merkleRoot as string).toLowerCase() !== `0x${"0".repeat(64)}`;

  const expired =
    claimDeadline !== undefined &&
    Number(claimDeadline) > 0 &&
    Date.now() / 1000 > Number(claimDeadline);

  const hasRewards =
    !!claimable &&
    !alreadyClaimed &&
    rootSet &&
    !expired &&
    airdropBalance !== undefined &&
    (airdropBalance as bigint) >= claimable.amount;

  const availableUsdc =
    claimable && !alreadyClaimed && rootSet && !expired
      ? formatUnits(claimable.amount, 6)
      : "0.00";

  return {
    hasDeployment: !!deployment,
    hasRewards,
    availableUsdc,
    alreadyClaimed: !!alreadyClaimed,
    expired,
    rootSet,
    claimDeadline: claimDeadline !== undefined ? Number(claimDeadline) : 0,
    claim,
    isPending: isPending || isConfirming,
    isSuccess,
  };
}
