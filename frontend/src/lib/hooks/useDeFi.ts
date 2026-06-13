"use client";

import { useCallback, useState, useMemo } from "react";
import {
  useConnection,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
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

export function useDeployment() {
  const chainId = useChainId();
  return getDeployment(chainId);
}

export function useTokenBalance(symbol: TokenSymbol) {
  const { address } = useConnection();
  const deployment = useDeployment();
  const token = deployment ? getTokenAddress(deployment, symbol) : undefined;

  const { data, refetch } = useReadContract({
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

  const { data: amounts } = useReadContract({
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
  const publicClient = usePublicClient();
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
  const publicClient = usePublicClient();
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
  const publicClient = usePublicClient();
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

      const reserveKhype = token0 === khype ? reserve0 : reserve1;
      const reserveUsdc = token0 === khype ? reserve1 : reserve0;

      const expectedKhype = (liquidity * reserveKhype) / totalSupply;
      const expectedUsdc = (liquidity * reserveUsdc) / totalSupply;
      const khypeMin = (expectedKhype * BigInt(10000 - slippageBps)) / BigInt(10000);
      const usdcMin = (expectedUsdc * BigInt(10000 - slippageBps)) / BigInt(10000);

      await ensureExactAllowance(
        publicClient,
        writeContractAsync,
        deployment.pair,
        abis.erc20,
        address,
        deployment.pair,
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

  const { data, refetch } = useReadContract({
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
  const { data } = useReadContract({
    address: deployment?.pair,
    abi: abis.pair,
    functionName: "getReserves",
    query: { enabled: !!deployment, refetchInterval: 10000 },
  });

  if (!data || !Array.isArray(data)) return null;
  return {
    reserveKHYPE: formatUnits(data[0] as bigint, 18),
    reserveUSDC: formatUnits(data[1] as bigint, 6),
  };
}

export function useLpBalance() {
  const { address } = useConnection();
  const deployment = useDeployment();

  const { data, refetch } = useReadContract({
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

export function useEpochCountdown() {
  const deployment = useDeployment();

  const { data: secondsLeft } = useReadContract({
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

  const { data: alreadyClaimed } = useReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "claimed",
    args: address ? [address] : undefined,
    query: { enabled: !!deployment && !!address },
  });

  const { data: airdropBalance } = useReadContract({
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
