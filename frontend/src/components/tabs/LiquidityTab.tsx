"use client";

import { useEffect, useState } from "react";
import { Plus, Droplets } from "lucide-react";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { POOLS } from "@/lib/constants";
import { VaultPanel } from "@/components/position/VaultPanel";
import { RebalanceHistoryPanel } from "@/components/position/RebalanceHistoryPanel";
import { ActivePositionPanel } from "@/components/position/ActivePositionPanel";
import { CreatePositionModal } from "@/components/position/CreatePositionModal";
import { appendRebalanceEvent, readRebalanceHistory, type RebalanceEvent } from "@/lib/liquidity/history";
import { poolPriceUsdcPerKhype, rangeBounds } from "@/lib/liquidity/metrics";
import {
  useDeployment,
  useLpBalance,
  usePoolStats,
  useRemoveLiquidity,
  useTokenBalance,
  useVaultBalance,
  useVaultStats,
  useVaultWithdraw,
  useZapLiquidity,
} from "@/lib/hooks/useDeFi";

const RANGE_STORAGE_KEY = "hyperpool_position_range";

function readStoredRange(): { lower: number; upper: number; widthPct: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeRange(lower: number, upper: number, widthPct: number) {
  localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify({ lower, upper, widthPct }));
}

export function LiquidityTab() {
  const { isConnected, showToast, openWalletModal } = useApp();
  const { t } = useI18n();
  const deployment = useDeployment();
  const pool = usePoolStats();
  const khypeBal = useTokenBalance("kHYPE");
  const usdcBal = useTokenBalance("USDC");
  const { balance: lpBalance, hasPosition, refetch: refetchLp } = useLpBalance();
  const vaultStats = useVaultStats();
  const vaultBalance = useVaultBalance();
  const { withdraw: withdrawVault, isPending: withdrawingVault, isSuccess: withdrawVaultSuccess } = useVaultWithdraw();
  const { zap, isPending: zapping, isSuccess: zapSuccess } = useZapLiquidity();
  const { removeLiquidity, isPending: removing, isSuccess: removeSuccess } = useRemoveLiquidity();

  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"create" | "add">("create");
  const [history, setHistory] = useState<RebalanceEvent[]>([]);

  const price = poolPriceUsdcPerKhype(pool.reserveKhype, pool.reserveUsdc);
  const defaultRange = rangeBounds(price, 3);
  const storedRange = readStoredRange();
  const rangeLower = storedRange?.lower ?? defaultRange.lower;
  const rangeUpper = storedRange?.upper ?? defaultRange.upper;
  const rangeWidthPct = storedRange?.widthPct ?? defaultRange.widthPct;
  const livePool = POOLS.find((p) => p.live);
  const poolApr = livePool?.aprNum ?? 124.5;

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
    if (removeSuccess) {
      showToast(t("liquidity.removeSuccess"));
      refetchLp();
    }
  }, [removeSuccess, showToast, t, refetchLp]);

  useEffect(() => {
    if (withdrawVaultSuccess) {
      showToast(t("position.withdrawSuccess"));
      vaultStats.refetch();
      vaultBalance.refetch();
      khypeBal.refetch();
      usdcBal.refetch();
    }
  }, [withdrawVaultSuccess, showToast, t, vaultStats, vaultBalance, khypeBal, usdcBal]);

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

  const handleZap = async (source: "kHYPE" | "USDC", amount: string, widthPct: number) => {
    const half = widthPct / 2;
    const bounds = {
      lower: Math.round(price * (1 - half / 100)),
      upper: Math.round(price * (1 + half / 100)),
      widthPct,
    };
    storeRange(bounds.lower, bounds.upper, bounds.widthPct);
    try {
      await zap(source, amount);
      const next = appendRebalanceEvent({
        price: Math.round(price),
        lower: bounds.lower,
        upper: bounds.upper,
        rangePct: half,
        action: createMode === "add" ? "add" : "zap",
        amountUsd: parseFloat(amount),
      });
      setHistory(next);
      showToast(t("position.createSuccess"));
    } catch {
      showToast(t("position.createFailed"));
    }
  };

  const handleRemove = async () => {
    if (!hasPosition || !deployment) return;
    try {
      await removeLiquidity(lpBalance);
      appendRebalanceEvent({
        price: Math.round(price),
        lower: rangeLower,
        upper: rangeUpper,
        rangePct: rangeWidthPct / 2,
        action: "remove",
      });
    } catch {
      showToast(t("liquidity.removeFailed"));
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
  const displayRangeWidth = vaultStats.hasVault ? vaultStats.targetRangeBps / 100 : rangeWidthPct;

  return (
    <div className="max-w-6xl mx-auto w-full space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("position.title")}</h2>
          <p className="text-xs text-zinc-500 mt-1">{t("position.subtitle")}</p>
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
          <RebalanceHistoryPanel events={history} />
        </div>

        <div className="space-y-4">
          <div className="card-glass rounded-2xl p-4 border border-zinc-800">
            <h3 className="text-sm font-semibold text-white mb-3">{t("position.myLiquidity")}</h3>
            {!isConnected ? (
              <div className="p-6 rounded-xl border border-dashed border-zinc-700 text-center">
                <Droplets className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500">{t("liquidity.connectToView")}</p>
              </div>
            ) : hasAnyPosition ? (
              <ActivePositionPanel
                lpBalance={displayLpBalance}
                totalSupply={pool.totalSupply}
                reserveKhype={pool.reserveKhype}
                reserveUsdc={pool.reserveUsdc}
                poolApr={poolApr}
                rangeLower={rangeLower}
                rangeUpper={rangeUpper}
                rangeWidthPct={displayRangeWidth}
                onAdd={() => openCreate("add")}
                onCollectFees={() => showToast(t("position.feesAutoCompound"))}
                onClose={() => (vaultBalance.hasVaultPosition ? handleVaultWithdraw(vaultBalance.shares) : handleRemove())}
                adding={false}
                closing={removing || withdrawingVault}
              />
            ) : (
              <p className="text-sm text-zinc-500 text-center py-8 rounded-xl border border-dashed border-zinc-700">
                {t("liquidity.noPositions")}
              </p>
            )}
          </div>
        </div>

        <div className="card-glass rounded-2xl p-4 border border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-3">{t("position.poolOverview")}</h3>
          <div className="space-y-2">
            {POOLS.filter((p) => p.live).map((poolItem) => (
              <div
                key={poolItem.id}
                className="p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5"
              >
                <p className="font-medium text-white text-sm">
                  {poolItem.pair} <span className="text-zinc-500">{poolItem.feeTier}</span>
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <p className="text-zinc-500">{t("position.apy")}</p>
                    <p className="text-emerald-400 font-semibold">{poolItem.apr}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">{t("position.tvl")}</p>
                    <p className="text-zinc-300">
                      {pool.reserveUsdc > 0
                        ? `$${(pool.reserveUsdc * 2).toFixed(0)}`
                        : poolItem.tvl}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">{t("position.volume24h")}</p>
                    <p className="text-zinc-300">{poolItem.volume24h}</p>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-zinc-500 tabular-nums">
                  {t("position.currentPrice")}: {Math.round(price).toLocaleString()} USDC/kHYPE
                </p>
              </div>
            ))}
          </div>
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
