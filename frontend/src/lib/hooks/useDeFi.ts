"use client";

import { useCallback, useState, useMemo, useEffect } from "react";
import {
  useConnection,
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
import { ensureExactAllowance } from "@/lib/erc20";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useI18n } from "@/lib/i18n";
import { lpReservesFromTvl, refPriceToUsdPerHype } from "@/lib/liquidity/price";

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

/** @deprecated Use Vault deposit */
export function useAddLiquidity() {
  return { addLiquidity: async () => {}, isPending: false, isSuccess: false, hash: undefined };
}

/** @deprecated Use useVaultWithdraw */
export function useRemoveLiquidity() {
  return { removeLiquidity: async () => {}, isPending: false, isSuccess: false, hash: undefined };
}

export function useEnterInvitationCode() {
  const deployment = useDeployment();
  const chainId = useEffectiveChainId();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enterCode = useCallback(
    async (code: `0x${string}`) => {
      if (!deployment) throw new Error("Contracts not deployed on this network");
      if (!deployment.referralRegistry) throw new Error("Referral registry not deployed");
      await writeContractAsync({
        chainId,
        address: deployment.referralRegistry,
        abi: abis.referral,
        functionName: "enterInvitationCode",
        args: [code],
      });
    },
    [chainId, deployment, writeContractAsync]
  );

  return { enterCode, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useRegisterReferralCode() {
  const deployment = useDeployment();
  const chainId = useEffectiveChainId();
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const registerCode = useCallback(
    async (code: `0x${string}`) => {
      if (!deployment) throw new Error("Contracts not deployed on this network");
      if (!deployment.referralRegistry) throw new Error("Referral registry not deployed");
      await writeContractAsync({
        chainId,
        address: deployment.referralRegistry,
        abi: abis.referral,
        functionName: "registerCode",
        args: [code],
      });
    },
    [chainId, deployment, writeContractAsync]
  );

  return { registerCode, isPending: isPending || isConfirming, isSuccess, hash };
}

export function usePoolReserves() {
  return null;
}

/** Live HYPE/USDC spot from Project X pool, with oracle / stored ref fallbacks. */
export function useHypePrice() {
  const deployment = useDeployment();
  const adapter = deployment?.projectXAdapter;
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;

  const { data: poolPriceRaw } = useDeploymentReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "currentPoolPriceUsdc6PerHype18",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const { data: oraclePriceRaw } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "oraclePriceUsdc6PerHype18",
    query: { enabled: !!vaultAddr, refetchInterval: 30_000 },
  });

  const { data: refPriceRaw } = useDeploymentReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "refPriceUsdc6PerHype18",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const raw =
    (poolPriceRaw as bigint | undefined) ??
    (oraclePriceRaw as bigint | undefined) ??
    (refPriceRaw as bigint | undefined);
  const priceUsd = raw !== undefined && raw > 0n ? refPriceToUsdPerHype(raw) : 0;

  return { priceUsd, refPriceRaw: raw };
}

export function usePoolStats() {
  const deployment = useDeployment();
  const { priceUsd } = useHypePrice();
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
  const totalAssetsUsdc =
    vaultUsdcBal !== undefined ? parseFloat(formatUnits(vaultUsdcBal as bigint, 6)) : 0;
  const { reserveHype: reserveKhype, reserveUsdc } = lpReservesFromTvl(totalAssetsUsdc, priceUsd);

  return {
    reserveKhype,
    reserveUsdc,
    totalAssetsUsdc,
    priceUsd,
    totalSupply: parseFloat(supply),
    totalSupplyRaw: totalSupply as bigint | undefined,
    hasDeployment: !!deployment,
  };
}

export function useZapLiquidity() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const chainId = useEffectiveChainId();
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
        amountIn,
        chainId
      );

      await writeContractAsync({
        address: vaultAddr,
        abi: abis.vault,
        functionName: fn,
        args: [amountIn, address],
        chainId,
      });
    },
    [deployment, address, chainId, publicClient, writeContractAsync]
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
  const chainId = useEffectiveChainId();
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
        chainId,
      });
    },
    [deployment, address, chainId, publicClient, writeContractAsync]
  );

  return { withdraw, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useHarvestFees() {
  const { address } = useConnection();
  const deployment = useDeployment();
  const chainId = useEffectiveChainId();
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { data: keeper } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "keeper",
    query: { enabled: !!vaultAddr },
  });

  const { data: vaultOwner } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "owner",
    query: { enabled: !!vaultAddr },
  });

  const canHarvest = useMemo(() => {
    if (!address || !keeper || !vaultOwner) return false;
    const a = address.toLowerCase();
    return (
      (keeper as string).toLowerCase() === a || (vaultOwner as string).toLowerCase() === a
    );
  }, [address, keeper, vaultOwner]);

  const harvestFees = useCallback(async () => {
    if (!vaultAddr) throw new Error("Vault unavailable");
    if (!canHarvest) throw new Error("NOT_KEEPER");
    await writeContractAsync({
      address: vaultAddr,
      abi: abis.vault,
      functionName: "harvestFees",
      chainId,
    });
  }, [vaultAddr, canHarvest, chainId, writeContractAsync]);

  return {
    harvestFees,
    canHarvest,
    isPending: isPending || isConfirming,
    isSuccess,
    hash,
  };
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
  const deployment = useDeployment();
  const distribution = useMemo(() => {
    if (!deployment?.airdropEntries || !address) return null;
    const entry = deployment.airdropEntries.find((e) => e.address.toLowerCase() === address.toLowerCase());
    return entry ? BigInt(entry.amount) : null;
  }, [deployment, address]);

  const hasRewards = distribution !== null && distribution > 0n;
  const availableUsdc = hasRewards ? formatUnits(distribution, 6) : "0.00";

  return {
    hasDeployment: !!deployment,
    hasRewards,
    availableUsdc,
    alreadyClaimed: false,
    expired: false,
    rootSet: !!deployment?.lastCashdropDistribution,
    claimDeadline: 0,
    claim: async () => {},
    isPending: false,
    isSuccess: false,
    lastDistribution: deployment?.lastCashdropDistribution,
  };
}
