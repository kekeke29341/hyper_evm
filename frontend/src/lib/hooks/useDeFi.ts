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
import { CASHDROP_JST, VAULT_SHARE_DECIMALS } from "@/lib/constants";
import {
  abis,
  getDeployment,
  getVaultAddress,
  getTokenAddress,
  getTokenDecimals,
  type TokenSymbol,
} from "@/lib/contracts";
import { ensureExactAllowance } from "@/lib/erc20";
import { formatUsdcDisplay } from "@/lib/earnings/deploymentPayouts";
import { useCashdropPayoutClaims } from "@/lib/hooks/useCashdropPayoutClaims";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { defaultChain } from "@/lib/wagmi/config";
import { useI18n } from "@/lib/i18n";
import { positionTokenAmounts } from "@/lib/liquidity/metrics";
import { compositionFromRefPrice, mapAdapterTokenAmounts } from "@/lib/liquidity/composition";
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

export function useBindReferrer() {
  const chainId = defaultChain.id;
  const deployment = getDeployment(chainId);
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const bindReferrer = useCallback(
    async (referrer: `0x${string}`) => {
      if (!deployment) throw new Error("Contracts not deployed on this network");
      if (!deployment.referralRegistry) throw new Error("Referral registry not deployed");
      await writeContractAsync({
        chainId,
        address: deployment.referralRegistry,
        abi: abis.referral,
        functionName: "bindReferrer",
        args: [referrer],
      });
    },
    [chainId, deployment, writeContractAsync]
  );

  return { bindReferrer, isPending: isPending || isConfirming, isSuccess, hash };
}

export function useRegisterReferrer() {
  const chainId = defaultChain.id;
  const deployment = getDeployment(chainId);
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const registerReferrer = useCallback(async () => {
    if (!deployment) throw new Error("Contracts not deployed on this network");
    if (!deployment.referralRegistry) throw new Error("Referral registry not deployed");
    await writeContractAsync({
      chainId,
      address: deployment.referralRegistry,
      abi: abis.referral,
      functionName: "registerReferrer",
    });
  }, [chainId, deployment, writeContractAsync]);

  return { registerReferrer, isPending: isPending || isConfirming, isSuccess, hash };
}

export function usePoolReserves() {
  return null;
}

/** Live HYPE/USDC spot from Project X pool, with oracle / stored ref fallbacks. */
export function useHypePrice() {
  const deployment = useDeployment();
  const adapter = deployment?.projectXAdapter;
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;

  const poolPriceQuery = useDeploymentReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "currentPoolPriceUsdc6PerHype18",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const oraclePriceQuery = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "oraclePriceUsdc6PerHype18",
    query: { enabled: !!vaultAddr, refetchInterval: 30_000 },
  });

  const refPriceQuery = useDeploymentReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "refPriceUsdc6PerHype18",
    query: { enabled: !!adapter, refetchInterval: 30_000 },
  });

  const poolPriceRaw = poolPriceQuery.data;
  const oraclePriceRaw = oraclePriceQuery.data;
  const refPriceRaw = refPriceQuery.data;

  const raw =
    (poolPriceRaw as bigint | undefined) ??
    (oraclePriceRaw as bigint | undefined) ??
    (refPriceRaw as bigint | undefined);
  const priceUsd = raw !== undefined && raw > 0n ? refPriceToUsdPerHype(raw) : 0;

  const isLoading =
    !!adapter &&
    raw === undefined &&
    (poolPriceQuery.isFetching || oraclePriceQuery.isFetching || refPriceQuery.isFetching);

  return { priceUsd, refPriceRaw: raw, isLoading };
}

export function usePoolStats() {
  const deployment = useDeployment();
  const { priceUsd, refPriceRaw, isLoading: isPriceLoading } = useHypePrice();
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;
  const adapter = deployment?.projectXAdapter;
  const whype = deployment ? getTokenAddress(deployment, "kHYPE") : undefined;
  const usdcToken = deployment ? getTokenAddress(deployment, "USDC") : undefined;

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

  const { data: pendingRewards } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "pendingUserRewards",
    query: { enabled: !!vaultAddr, refetchInterval: 10000 },
  });

  const { data: positionAmounts } = useDeploymentReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "positionTokenAmounts",
    query: { enabled: !!adapter, refetchInterval: 10000 },
  });

  const { data: vaultIdleHype } = useDeploymentReadContract({
    address: whype,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: vaultAddr ? [vaultAddr] : undefined,
    query: { enabled: !!vaultAddr && !!whype, refetchInterval: 10000 },
  });

  const { data: vaultUsdcBalRaw } = useDeploymentReadContract({
    address: usdcToken,
    abi: abis.erc20,
    functionName: "balanceOf",
    args: vaultAddr ? [vaultAddr] : undefined,
    query: { enabled: !!vaultAddr && !!usdcToken, refetchInterval: 10000 },
  });

  const { data: adapterToken0 } = useDeploymentReadContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "token0",
    query: { enabled: !!adapter, refetchInterval: 60000 },
  });

  const supply = totalSupply !== undefined ? formatUnits(totalSupply as bigint, VAULT_SHARE_DECIMALS) : "0";
  const totalAssetsUsdc =
    vaultUsdcBal !== undefined ? parseFloat(formatUnits(vaultUsdcBal as bigint, 6)) : 0;

  const composition = useMemo(() => {
    if (
      !deployment ||
      !whype ||
      positionAmounts === undefined ||
      vaultIdleHype === undefined ||
      vaultUsdcBalRaw === undefined ||
      pendingRewards === undefined ||
      !refPriceRaw ||
      refPriceRaw <= 0n
    ) {
      const fallback = lpReservesFromTvl(totalAssetsUsdc, priceUsd);
      return {
        ...fallback,
        lpHype: 0,
        lpUsdc: 0,
        idleHype: 0,
        idleUsdc: 0,
        hypePct: totalAssetsUsdc > 0 && priceUsd > 0 ? 50 : 0,
        usdcPct: totalAssetsUsdc > 0 ? 50 : 0,
        isLive: false,
      };
    }

    const [amount0, amount1] = positionAmounts as readonly [bigint, bigint];
    const mapped = mapAdapterTokenAmounts(
      amount0,
      amount1,
      adapterToken0 as `0x${string}`,
      whype
    );
    const pending = pendingRewards as bigint;
    const vaultUsdcTotal = vaultUsdcBalRaw as bigint;
    const idleUsdc = vaultUsdcTotal > pending ? vaultUsdcTotal - pending : 0n;

    const live = compositionFromRefPrice(
      mapped.hype,
      mapped.usdc,
      vaultIdleHype as bigint,
      idleUsdc,
      refPriceRaw
    );

    return { ...live, isLive: true };
  }, [
    adapterToken0,
    deployment,
    pendingRewards,
    positionAmounts,
    priceUsd,
    refPriceRaw,
    totalAssetsUsdc,
    vaultIdleHype,
    vaultUsdcBalRaw,
    whype,
  ]);

  return {
    reserveKhype: composition.reserveHype,
    reserveUsdc: composition.reserveUsdc,
    lpKhype: composition.lpHype,
    lpUsdc: composition.lpUsdc,
    idleKhype: composition.idleHype,
    idleUsdc: composition.idleUsdc,
    hypePct: composition.hypePct,
    usdcPct: composition.usdcPct,
    compositionIsLive: composition.isLive,
    totalAssetsUsdc,
    priceUsd,
    isPriceLoading,
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
  const { writeContractAsync, isPending } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const zap = useCallback(
    async (source: "kHYPE" | "USDC", totalAmount: string) => {
      if (!deployment || !address || !publicClient) throw new Error("Wallet not connected");
      const vaultAddr = getVaultAddress(deployment);
      if (!vaultAddr) throw new Error("Vault unavailable");
      setError(null);
      setHash(undefined);
      setIsSuccess(false);

      const tokenIn = source === "USDC" ? deployment.tokenUSDC : deployment.tokenKHYPE;
      const decimals = source === "USDC" ? 6 : 18;
      const amountIn = parseUnits(totalAmount, decimals);
      const fn = source === "USDC" ? "depositUSDC" : "depositHYPE";

      setIsConfirming(true);
      try {
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

        const depositHash = await writeContractAsync({
          address: vaultAddr,
          abi: abis.vault,
          functionName: fn,
          args: [amountIn, address],
          chainId,
        });
        setHash(depositHash);
        await publicClient.waitForTransactionReceipt({ hash: depositHash });
        setIsSuccess(true);
        return depositHash;
      } finally {
        setIsConfirming(false);
      }
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
  const { address } = useConnection();
  const deployment = useDeployment();
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;

  const { data, refetch } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!vaultAddr, refetchInterval: 10000 },
  });

  const raw = data as bigint | undefined;
  const balance = raw !== undefined ? formatUnits(raw, VAULT_SHARE_DECIMALS) : "0";

  return {
    balance,
    hasPosition: raw !== undefined && raw > 0n,
    refetch,
  };
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
  const pool = usePoolStats();
  const vaultAddr = deployment ? getVaultAddress(deployment) : undefined;

  const { data, refetch, isLoading } = useDeploymentReadContract({
    address: vaultAddr,
    abi: abis.vault,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && stats.hasVault, refetchInterval: 10000 },
  });

  const sharesRaw = data as bigint | undefined;
  const shares = sharesRaw !== undefined ? formatUnits(sharesRaw, VAULT_SHARE_DECIMALS) : "0";
  const userShares = parseFloat(shares);
  const shareFraction = stats.shareSupplyFloat > 0 ? userShares / stats.shareSupplyFloat : 0;
  const assetsUsd = stats.totalAssetsUsdc * shareFraction;
  const lpTokens = positionTokenAmounts(
    userShares,
    pool.totalSupply,
    pool.reserveKhype,
    pool.reserveUsdc
  );

  return {
    shares,
    sharesRaw,
    isLoading: !!address && stats.hasVault && isLoading,
    hasVaultPosition: sharesRaw !== undefined && sharesRaw > BigInt(0),
    khype: lpTokens.hype,
    usdc: lpTokens.usdc,
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
  const processingStart = new Date(nowJst);
  processingStart.setHours(CASHDROP_JST.processingStartHour, 0, 0, 0);
  const payoutTarget = new Date(nowJst);
  payoutTarget.setHours(CASHDROP_JST.payoutHour, 0, 0, 0);

  if (nowJst >= processingStart && nowJst < payoutTarget) {
    return { h: 0, m: 0, s: 0, formatted: claimOpenLabel, isClaimWindow: true };
  }

  let target = payoutTarget;
  if (nowJst >= payoutTarget) {
    target = new Date(payoutTarget);
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
  const deployment = useDeployment();
  const { lastPayout, hasHistory, isLoading: payoutLoading } = useCashdropPayoutClaims();

  const lastPayoutUsdc = lastPayout?.usdc ?? 0;
  const hasRewards = hasHistory && lastPayoutUsdc > 0;
  const availableUsdc = formatUsdcDisplay(lastPayoutUsdc);
  const lastPayoutTxHash = lastPayout?.txHash ?? deployment?.lastCashdropDistribution?.txHash;

  return {
    hasDeployment: !!deployment,
    hasRewards,
    availableUsdc,
    lastPayoutAt: lastPayout?.t ?? null,
    lastPayoutTxHash,
    alreadyClaimed: false,
    expired: false,
    rootSet: !!deployment?.lastCashdropDistribution,
    claimDeadline: 0,
    claim: async () => {},
    isPending: payoutLoading,
    isSuccess: false,
    lastDistribution: deployment?.lastCashdropDistribution,
    onChainPayout: !!lastPayout?.txHash,
  };
}
