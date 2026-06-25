"use client";

import { useEffect, useState } from "react";
import { Plus, Droplets } from "lucide-react";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { POOLS, PROJECT_X_POOL, MANAGED_LP_RANGE } from "@/lib/constants";
import { VaultPanel } from "@/components/position/VaultPanel";
import { RebalanceHistoryPanel } from "@/components/position/RebalanceHistoryPanel";
import { ActivePositionPanel } from "@/components/position/ActivePositionPanel";
import { CreatePositionModal } from "@/components/position/CreatePositionModal";
import { appendRebalanceEvent, readRebalanceHistory, type RebalanceEvent } from "@/lib/liquidity/history";
import { poolPriceUsdcPerKhype, managedRangeBounds } from "@/lib/liquidity/metrics";
import {
  useDeployment,
  useLpBalance,
  usePoolStats,
  useTokenBalance,
  useVaultBalance,
  useVaultStats,
  useVaultWithdraw,
  useZapLiquidity,
  useHarvestFees,
} from "@/lib/hooks/useDeFi";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";

export function LiquidityTab() {
  const { isConnected, showToast, openWalletModal } = useApp();
  const { t } = useI18n();
  const chainId = useEffectiveChainId();
  const deployment = useDeployment();
  const pool = usePoolStats();
  const khypeBal = useTokenBalance("kHYPE");
  const usdcBal = useTokenBalance("USDC");
  const { balance: lpBalance, hasPosition, refetch: refetchLp } = useLpBalance();
  const vaultStats = useVaultStats();
  const vaultBalance = useVaultBalance();
  const { withdraw: withdrawVault, isPending: withdrawingVault, isSuccess: withdrawVaultSuccess } = useVaultWithdraw();
  const { zap, isPending: zapping, isSuccess: zapSuccess } = useZapLiquidity();
  const {
    harvestFees,
    canHarvest,
    isPending: harvestingFees,
    isSuccess: harvestFeesSuccess,
  } = useHarvestFees();

  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"create" | "add">("create");
  const [history, setHistory] = useState<RebalanceEvent[]>([]);

  const livePrice = poolPriceUsdcPerKhype(pool.reserveKhype, pool.reserveUsdc);
  const poolReserveKhype = pool.reserveKhype;
  const poolReserveUsdc = pool.reserveUsdc;
  const poolTotalSupply = pool.totalSupply;
  const price = livePrice > 0 ? livePrice : poolPriceUsdcPerKhype(poolReserveKhype, poolReserveUsdc);
  const managedRange = managedRangeBounds(price);
  const rangeLower = managedRange.lower;
  const rangeUpper = managedRange.upper;
  const poolApr = PROJECT_X_POOL.referenceAprNum;
  const useLiveVaultMetrics = chainId === 998 || chainId === 999;
  const displayTvl =
    useLiveVaultMetrics && vaultStats.totalAssetsUsdc > 0
      ? `$${Math.round(vaultStats.totalAssetsUsdc).toLocaleString()}`
      : pool.reserveUsdc > 0
        ? `$${(pool.reserveUsdc * 2).toFixed(0)}`
        : "—";
  const displayVolume = useLiveVaultMetrics ? "—" : PROJECT_X_POOL.volume24h;
  const displayReferenceApr =
    useLiveVaultMetrics && !vaultStats.hasVault ? "—" : PROJECT_X_POOL.referenceApr;

  useEffect(() => {
    setHistory(readRebalanceHistory());
  }, []);

  useEffect(() => {
    if (zapSuccess) {
      showToast(t("position.createSuccess"));
      refetchLp();
      khypeBal.refetch();
      usdcBal.refetch();
      vaultStats.refetch();
      vaultBalance.refetch();
    }
  }, [zapSuccess, showToast, t, refetchLp, khypeBal, usdcBal, vaultStats, vaultBalance]);

  useEffect(() => {
    if (withdrawVaultSuccess) {
      showToast(t("position.withdrawSuccess"));
      vaultStats.refetch();
      vaultBalance.refetch();
      khypeBal.refetch();
      usdcBal.refetch();
    }
  }, [withdrawVaultSuccess, showToast, t, vaultStats, vaultBalance, khypeBal, usdcBal]);

  useEffect(() => {
    if (harvestFeesSuccess) {
      showToast(t("position.collectFeesSuccess"));
      vaultStats.refetch();
    }
  }, [harvestFeesSuccess, showToast, t, vaultStats]);

  const openCreate = (mode: "create" | "add") => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!deployment) {
      showToast(t("liquidity.deployFirst"));
      return;
    }
    setCreateMode(mode);
    setCreateOpen(true);
  };

  const handleZap = async (source: "kHYPE" | "USDC", amount: string) => {
    const bounds = managedRangeBounds(price);
    try {
      await zap(source, amount);
      const next = appendRebalanceEvent({
        price: Math.round(price),
        lower: bounds.lower,
        upper: bounds.upper,
        rangePct: bounds.widthPct,
        action: createMode === "add" ? "add" : "deposit",
        amountUsd: parseFloat(amount),
      });
      setHistory(next);
      showToast(t("position.createSuccess"));
    } catch {
      showToast(t("position.createFailed"));
    }
  };

  const handleCollectFees = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!canHarvest) {
      showToast(t("position.collectFeesUserHint"));
      return;
    }
    try {
      await harvestFees();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("NOT_KEEPER")) {
        showToast(t("position.collectFeesNotKeeper"));
      } else if (msg.toLowerCase().includes("user rejected")) {
        return;
      } else {
        showToast(t("position.collectFeesFailed"));
      }
    }
  };

  const handleVaultWithdraw = async (shares: string) => {
    if (!shares || parseFloat(shares) <= 0) return;
    try {
      await withdrawVault(shares);
    } catch {
      showToast(t("position.withdrawFailed"));
    }
  };

  const hasAnyPosition = hasPosition || vaultBalance.hasVaultPosition;
  const displayLpBalance = vaultBalance.hasVaultPosition
    ? vaultStats.vaultLp * (parseFloat(vaultBalance.shares) / (vaultStats.shareSupplyFloat || 1))
    : parseFloat(lpBalance);
  const displayRangeWidth = managedRange.widthPct;

  const poolOverview = (
    <div className="space-y-2">
      {POOLS.map((poolItem) => (
        <div
          key={poolItem.id}
          className="p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5"
        >
          <p className="font-medium text-white text-sm">
            {poolItem.pair} <span className="text-zinc-500">{poolItem.feeTier}</span>
          </p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
            <div>
              <p className="text-zinc-500">{t("position.apy")}</p>
              <p className="text-emerald-400 font-semibold">{displayReferenceApr}</p>
              <p className="text-zinc-600">
                {t("position.netApy")} {poolItem.netAprEstimate}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">{t("position.tvl")}</p>
              <p className="text-zinc-300">{displayTvl}</p>
            </div>
            <div>
              <p className="text-zinc-500">{t("position.volume24h")}</p>
              <p className="text-zinc-300">{displayVolume}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500 tabular-nums">
            {t("position.currentPrice")}: {Math.round(price).toLocaleString()} USDC/HYPE
          </p>
          <p className="mt-1 text-[10px] text-zinc-600">{t("position.managedRangeFixed")}</p>
          <p className="mt-1 text-[10px] text-zinc-600">{t("position.feeSplitFootnote")}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto w-full space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("position.title")}</h2>
          <p className="text-xs text-zinc-500 mt-1">
            {t("position.subtitle")} · {MANAGED_LP_RANGE.label}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate("create")}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl gradient-btn text-sm font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" /> {t("position.createPosition")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <VaultPanel
            khypeBalance={khypeBal.balance}
            usdcBalance={usdcBal.balance}
            hasVault={vaultStats.hasVault}
            vaultShares={vaultBalance.shares}
            vaultValueUsd={vaultBalance.valueUsd}
            vaultKhype={vaultBalance.khype}
            vaultUsdc={vaultBalance.usdc}
            onDeposit={() => openCreate("create")}
            onWithdraw={handleVaultWithdraw}
            withdrawing={withdrawingVault}
          />
          <RebalanceHistoryPanel events={history} className="hidden sm:block" />
        </div>

        <div className="space-y-4">
          <div className="card-glass rounded-2xl p-4 border border-zinc-800">
            <h3 className="text-sm font-semibold text-white mb-3">{t("position.myLiquidity")}</h3>
            {!hasAnyPosition ? (
              <div className="p-6 rounded-xl border border-dashed border-zinc-700 text-center">
                <Droplets className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500">{t("liquidity.connectToView")}</p>
              </div>
            ) : (
              <ActivePositionPanel
                lpBalance={displayLpBalance}
                totalSupply={poolTotalSupply}
                reserveKhype={poolReserveKhype}
                reserveUsdc={poolReserveUsdc}
                poolApr={poolApr}
                rangeLower={rangeLower}
                rangeUpper={rangeUpper}
                rangeWidthPct={displayRangeWidth}
                onAdd={() => openCreate("add")}
                onCollectFees={handleCollectFees}
                onClose={() =>
                  vaultBalance.hasVaultPosition
                    ? handleVaultWithdraw(vaultBalance.shares)
                    : showToast(t("liquidity.noPositions"))
                }
                adding={false}
                canHarvest={canHarvest}
                collecting={harvestingFees}
                closing={withdrawingVault}
              />
            )}
          </div>
        </div>

        <details className="card-glass rounded-2xl border border-zinc-800 lg:hidden open:pb-4">
          <summary className="p-4 cursor-pointer text-sm font-semibold text-white list-none flex items-center justify-between">
            {t("position.poolOverviewToggle")}
            <span className="text-zinc-500 text-xs">{t("position.poolOverview")}</span>
          </summary>
          <div className="px-4 pb-1">{poolOverview}</div>
        </details>

        <div className="hidden lg:block card-glass rounded-2xl p-4 border border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-3">{t("position.poolOverview")}</h3>
          {poolOverview}
        </div>
      </div>

      <CreatePositionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        reserveKhype={pool.reserveKhype}
        reserveUsdc={pool.reserveUsdc}
        onConfirmZap={handleZap}
        isPending={zapping}
        mode={createMode}
      />
    </div>
  );
}
