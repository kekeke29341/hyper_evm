"use client";

import { Loader2, Plus, Coins, X } from "lucide-react";
import { PROJECT_X_POOL } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import {
  estimatedNetApy,
  formatUsd,
  positionTokenAmounts,
  positionValueUsd,
  poolPriceUsdcPerKhype,
} from "@/lib/liquidity/metrics";

export function ActivePositionPanel({
  lpBalance,
  totalSupply,
  reserveKhype,
  reserveUsdc,
  spotPriceUsd,
  spotPriceLoading = false,
  poolApr,
  hypePct,
  usdcPct,
  idleKhype = 0,
  compositionIsLive = false,
  onAdd,
  onCollectFees,
  onClose,
  adding,
  canHarvest,
  collecting,
  closing,
}: {
  lpBalance: number;
  totalSupply: number;
  reserveKhype: number;
  reserveUsdc: number;
  spotPriceUsd: number;
  spotPriceLoading?: boolean;
  poolApr: number;
  hypePct?: number;
  usdcPct?: number;
  idleKhype?: number;
  compositionIsLive?: boolean;
  onAdd: () => void;
  onCollectFees: () => void;
  onClose: () => void;
  adding: boolean;
  canHarvest: boolean;
  collecting: boolean;
  closing: boolean;
}) {
  const { t } = useI18n();
  const priceReady = !spotPriceLoading && spotPriceUsd > 0;
  const price = priceReady ? spotPriceUsd : poolPriceUsdcPerKhype(reserveKhype, reserveUsdc);
  const { hype, usdc } = positionTokenAmounts(lpBalance, totalSupply, reserveKhype, reserveUsdc);
  const valueUsd = positionValueUsd(lpBalance, totalSupply, reserveKhype, reserveUsdc);
  // Net user estimate = live pool APR × 60% user share. No concentration multiplier —
  // it double-counted range narrowing on top of an already-concentrated pool APR.
  const estApy = estimatedNetApy(poolApr);

  return (
    <div className="card-glass rounded-2xl p-4 border border-cyan-500/20 bg-cyan-500/5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-white">{PROJECT_X_POOL.pair}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            {PROJECT_X_POOL.feeTier} · {t("position.managedLp")}
          </p>
        </div>
      </div>

      <div className="mt-1 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-zinc-500">{t("position.positionValue")}</span>
          <span className="text-white font-semibold tabular-nums">{formatUsd(valueUsd)}</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>{hype.toFixed(4)} HYPE</span>
          <span className="tabular-nums">{formatUsd(hype * price)}</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>{usdc.toFixed(2)} USDC</span>
          <span className="tabular-nums">{formatUsd(usdc)}</span>
        </div>
        {compositionIsLive ? (
          <div className="flex justify-between text-zinc-500">
            <span>{t("position.allocation")}</span>
            <span className="tabular-nums text-zinc-300">
              HYPE {hypePct?.toFixed(1)}% · USDC {usdcPct?.toFixed(1)}%
            </span>
          </div>
        ) : null}
        {idleKhype > 0.0001 ? (
          <p className="text-[10px] text-amber-400/90 leading-relaxed">
            {t("position.idleKhypeNote").replace("{amount}", idleKhype.toFixed(4))}
          </p>
        ) : null}
        <div className="flex justify-between pt-2 border-t border-zinc-800">
          <span className="text-zinc-500">{t("position.estimatedApy")}</span>
          <span className="text-emerald-400 font-semibold tabular-nums">{estApy.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">{t("position.poolApy")}</span>
          <span className="text-zinc-400 tabular-nums">{poolApr.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">{t("position.earnedFees")}</span>
          <span className="text-amber-400 tabular-nums">{t("position.feesAutoCompound")}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl border border-zinc-600 text-zinc-300 text-sm font-medium hover:border-cyan-500/40 transition-colors disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
          <span>{t("position.addLiquidity")}</span>
        </button>
        {canHarvest && (
          <button
            type="button"
            onClick={onCollectFees}
            disabled={collecting}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl border border-zinc-600 text-zinc-300 text-sm font-medium hover:border-amber-500/40 transition-colors disabled:opacity-50"
          >
            {collecting ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Coins className="w-4 h-4 shrink-0" />
            )}
            <span>{t("position.collectFees")}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={closing}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          {closing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
          <span>{t("position.closePair")}</span>
        </button>
      </div>
    </div>
  );
}
