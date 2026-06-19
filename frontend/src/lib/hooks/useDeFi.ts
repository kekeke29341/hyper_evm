"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import {
  useConnection,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, zeroAddress } from "viem";
import { VAULT_SHARE_DECIMALS } from "@/lib/constants";
import {
  abis,
  getDeployment,
  getVaultAddress,
  getTokenAddress,
  getTokenDecimals,
  type TokenSymbol,
} from "@/lib/contracts";
import { PROJECT_X_POOL } from "@/lib/constants";
import { appendEarningsClaim, earningsStorageKey } from "@/lib/earnings/history";
import { getMerkleProof } from "@/lib/admin/merkle";
import MerkleAirdropAbi from "@/lib/contracts/abis/MerkleAirdrop.json";
import { ensureExactAllowance } from "@/lib/erc20";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useI18n } from "@/lib/i18n";

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

/** @deprecated Local DEX removed — use Li.FI bridge + Vault deposit */
export function useSwapQuote(..._args: [TokenSymbol?, TokenSymbol?, string?]) {
  void _args;
  return { amountOut: "", amountsOut: undefined };
}

/** @deprecated Local DEX removed */
export function useSwap(..._args: [TokenSymbol?, TokenSymbol?]) {
  void _args;
  return {
    swap: async () => {
      throw new Error("Local swap removed — use Deposit tab");
    },
    isPending: false,
    isSuccess: false,
    error: null,
    hash: undefined,
  };
}

/** @deprecated Use useZapLiquidity / Vault deposit */
export function useAddLiquidity() {
  return { addLiquidity: async () => {}, isPending: false, isSuccess: false, hash: undefined };
}

/** @deprecated Use useVaultWithdraw */
export function useRemoveLiquidity() {
  return { removeLiquidity: async () => {}, isPending: false, isSuccess: false, hash: undefined };
}

export function useEnterInvitationCode() {
  const deployment = useDeployment();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enterCode = useCallback(
    async (code: `0x${string}`) => {
      if (!deployment) throw new Error("Contracts not deployed on this network");
      if (!deployment.referralRegistry) throw new Error("Referral registry not deployed");
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
      if (!deployment.referralRegistry) throw new Error("Referral registry not deployed");
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

export function usePoolReserves() {
  return null;
}

export function usePoolStats() {
  const deployment = useDeployment();
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;

  const { data: vaultUsdcBal } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "totalAssetsUsdc",
    query: { enabled: !!vaultAddr, refetchInterval: 10000 },
  });

  const { data: totalSupply } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "totalSupply",
    query: { enabled: !!vaultAddr, refetchInterval: 10000 },
  });

  const supply = totalSupply !== undefined ? formatUnits(totalSupply as bigint, VAULT_SHARE_DECIMALS) : "0";
  const reserveUsdc =
    vaultUsdcBal !== undefined
      ? parseFloat(formatUnits(vaultUsdcBal as bigint, 6))
      : parseFloat(PROJECT_X_POOL.tvl.replace(/[$MK]/g, "")) * (PROJECT_X_POOL.tvl.includes("M") ? 1_000_000 : 1_000);
  const reserveKhype = reserveUsdc > 0 ? reserveUsdc / 42 : 0;

  return {
    reserveKhype,
    reserveUsdc,
    totalSupply: parseFloat(supply),
    totalSupplyRaw: totalSupply as bigint | undefined,
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
      const vaultAddr = getVaultAddress(deployment);
      if (!vaultAddr) throw new Error("Vault unavailable");
      setError(null);

      const tokenIn = source === "USDC" ? deployment.tokenUSDC : deployment.tokenKHYPE;
      const decimals = source === "USDC" ? 6 : 18;
      const amountIn = parseUnits(totalAmount, decimals);
      const fn = source === "USDC" ? "depositUSDC" : "depositHYPE";

      await ensureExactAllowance(
        publicClient,
        writeContractAsync,
        tokenIn,
        abis.erc20,
        address,
        vaultAddr,
        amountIn
      );

      await writeContractAsync({
        address: vaultAddr,
        abi: abis.vault,
        functionName: fn,
        args: [amountIn, address],
      });
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
  return { balance: "0", hasPosition: false, refetch: () => {} };
}

export function useVaultStats() {
  const deployment = useDeployment();
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;

  const { data: vaultShareSupply, refetch: refetchShareSupply } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "totalSupply",
    query: { enabled: !!vaultAddr, refetchInterval: 10000 },
  });

  const { data: pendingRewards } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "pendingUserRewards",
    query: { enabled: !!vaultAddr, refetchInterval: 10000 },
  });

  const { data: totalAssetsRaw } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "totalAssetsUsdc",
    query: { enabled: !!vaultAddr, refetchInterval: 10000 },
  });

  const { data: upperRangeBps } = useDeploymentReadContract({
    address: deployment?.projectXAdapter,
    abi: abis.adapter,
    functionName: "upperRangeBps",
    query: { enabled: !!deployment?.projectXAdapter, refetchInterval: 30000 },
  });

  const shareSupply = vaultShareSupply !== undefined ? formatUnits(vaultShareSupply as bigint, VAULT_SHARE_DECIMALS) : "0";
  const shareSupplyFloat = parseFloat(shareSupply);
  const pendingUsdc =
    pendingRewards !== undefined ? parseFloat(formatUnits(pendingRewards as bigint, 6)) : 0;
  const totalAssetsUsdc =
    totalAssetsRaw !== undefined ? parseFloat(formatUnits(totalAssetsRaw as bigint, 6)) : 0;

  return {
    hasVault: !!vaultAddr && vaultAddr !== zeroAddress,
    vaultAddress: vaultAddr,
    vaultLp: 0,
    vaultLpRaw: undefined,
    shareSupply,
    shareSupplyFloat,
    vaultKhype: 0,
    vaultUsdc: pendingUsdc,
    pendingRewardsUsdc: pendingUsdc,
    totalAssetsUsdc,
    vaultTvlUsd: totalAssetsUsdc,
    targetRangeBps: upperRangeBps !== undefined ? Number(upperRangeBps) : 1000,
    refetch: () => {
      refetchShareSupply();
    },
  };
}

export function useVaultBalance() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const stats = useVaultStats();
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;

  const { data, refetch } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && stats.hasVault, refetchInterval: 10000 },
  });

  const sharesRaw = data as bigint | undefined;
  const shares = sharesRaw !== undefined ? formatUnits(sharesRaw, VAULT_SHARE_DECIMALS) : "0";
  const share = stats.shareSupplyFloat > 0 ? parseFloat(shares) / stats.shareSupplyFloat : 0;

  const assetsUsd = stats.totalAssetsUsdc * share;

  return {
    shares,
    sharesRaw,
    hasVaultPosition: sharesRaw !== undefined && sharesRaw > BigInt(0),
    khype: 0,
    usdc: assetsUsd,
    valueUsd: assetsUsd,
    refetch,
  };
}

export function useVaultDepositDual() {
  const { zap, isPending, isSuccess, hash } = useZapLiquidity();
  return {
    depositDual: async (amountKHYPE: string, amountUSDC: string) => {
      if (parseFloat(amountUSDC) > 0) await zap("USDC", amountUSDC);
      else if (parseFloat(amountKHYPE) > 0) await zap("kHYPE", amountKHYPE);
    },
    isPending,
    isSuccess,
    hash,
  };
}

export function useVaultWithdraw() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const publicClient = useDeploymentPublicClient();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const withdraw = useCallback(
    async (shares: string) => {
      const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;
      if (!vaultAddr || !address || !publicClient) throw new Error("Vault unavailable");
      const shareAmount = parseUnits(shares, VAULT_SHARE_DECIMALS);

      await writeContractAsync({
        address: vaultAddr,
        abi: abis.vault,
        functionName: "withdraw",
        args: [shareAmount, address],
      });
    },
    [deployment, address, publicClient, writeContractAsync]
  );

  return { withdraw, isPending: isPending || isConfirming, isSuccess, hash };
}

export type EpochCountdown = {
  h: number;
  m: number;
  s: number;
  formatted: string;
  isClaimWindow: boolean;
};

export function computeEpochCountdown(now = Date.now(), claimOpenLabel: string): EpochCountdown {
  const nowJst = new Date(new Date(now).toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const start = new Date(nowJst);
  start.setHours(7, 0, 0, 0);
  const end = new Date(nowJst);
  end.setHours(9, 0, 0, 0);

  if (nowJst >= start && nowJst < end) {
    return { h: 0, m: 0, s: 0, formatted: claimOpenLabel, isClaimWindow: true };
  }

  let target = start;
  if (nowJst >= end) {
    target = new Date(start);
    target.setDate(target.getDate() + 1);
  }

  const total = Math.max(0, Math.floor((target.getTime() - nowJst.getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return {
    h,
    m,
    s,
    formatted: `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`,
    isClaimWindow: false,
  };
}

export function useEpochCountdown() {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(
    () => computeEpochCountdown(now, t("cashdrop.claimWindowOpen")),
    [now, t]
  );
}

export function useCashdrop() {
  const { address } = useConnection();
  const chainId = useChainId();
  const deployment = useDeployment();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const claimedAmountRef = useRef<string>("0");

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

  const { data: vaultShareToken } = useDeploymentReadContract({
    address: deployment?.airdrop,
    abi: MerkleAirdropAbi,
    functionName: "vaultShareToken",
    query: { enabled: !!deployment?.airdrop },
  });

  const claimable = useMemo(() => {
    if (!deployment?.airdropEntries || !address) return null;
    const gated =
      vaultShareToken !== undefined &&
      vaultShareToken !== null &&
      (vaultShareToken as string).toLowerCase() !== zeroAddress.toLowerCase();
    const entries = deployment.airdropEntries.map((e) => ({
      address: e.address,
      amount: BigInt(e.amount),
      minShares: e.minShares ? BigInt(e.minShares) : undefined,
    }));
    return getMerkleProof(entries, address, gated);
  }, [deployment, address, vaultShareToken]);

  const claim = useCallback(async () => {
    if (!deployment || !claimable) throw new Error("Nothing to claim");
    claimedAmountRef.current = formatUnits(claimable.amount, 6);
    await writeContractAsync({
      address: deployment.airdrop,
      abi: MerkleAirdropAbi,
      functionName: "claim",
      args: [claimable.amount, claimable.minShares, claimable.proof],
    });
  }, [deployment, claimable, writeContractAsync]);

  useEffect(() => {
    if (!isSuccess || !address || !chainId) return;
    const amount = parseFloat(claimedAmountRef.current);
    if (amount > 0) {
      appendEarningsClaim(earningsStorageKey(chainId, address), amount);
    }
  }, [isSuccess, address, chainId]);

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
