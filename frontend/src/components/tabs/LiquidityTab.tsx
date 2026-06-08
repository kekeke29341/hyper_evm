"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, Droplets, Minus } from "lucide-react";
import { POOLS } from "@/lib/constants";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { MainCard, PrimaryButton, InfoBanner } from "@/components/ui/shared";
import { cn } from "@/lib/utils";
import {
  useAddLiquidity,
  useRemoveLiquidity,
  useDeployment,
  usePoolReserves,
  useLpBalance,
} from "@/lib/hooks/useDeFi";

export function LiquidityTab() {
  const { isConnected, showToast, openWalletModal } = useApp();
  const { t } = useI18n();
  const deployment = useDeployment();
  const reserves = usePoolReserves();
  const { balance: lpBalance, hasPosition, refetch: refetchLp } = useLpBalance();
  const { addLiquidity, isPending: adding, isSuccess: addSuccess } = useAddLiquidity();
  const { removeLiquidity, isPending: removing, isSuccess: removeSuccess } = useRemoveLiquidity();
  const [showForm, setShowForm] = useState(false);
  const [khype, setKhype] = useState("1");
  const [usdc, setUsdc] = useState("2000");

  useEffect(() => {
    if (addSuccess) {
      showToast(t("liquidity.addSuccess"));
      setShowForm(false);
      refetchLp();
    }
  }, [addSuccess, showToast, t, refetchLp]);

  useEffect(() => {
    if (removeSuccess) {
      showToast(t("liquidity.removeSuccess"));
      refetchLp();
    }
  }, [removeSuccess, showToast, t, refetchLp]);

  const handleAdd = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!deployment) {
      showToast(t("liquidity.deployFirst"));
      return;
    }
    try {
      await addLiquidity(khype, usdc);
    } catch {
      showToast(t("liquidity.addFailed"));
    }
  };

  const handleRemove = async () => {
    if (!hasPosition || !deployment) return;
    try {
      await removeLiquidity(lpBalance);
    } catch {
      showToast(t("liquidity.removeFailed"));
    }
  };

  return (
    <MainCard>
      <h2 className="text-lg font-semibold text-white mb-2">{t("liquidity.title")}</h2>
      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 mb-4">
        {t("liquidity.feeShare")}
      </div>

      <InfoBanner text={t("swap.pointsInfo")} />

      {reserves && (
        <p className="text-xs text-zinc-500 mb-4 mt-3">
          {t("liquidity.poolTvl")}: {parseFloat(reserves.reserveKHYPE).toFixed(2)} kHYPE /{" "}
          {parseFloat(reserves.reserveUSDC).toFixed(0)} USDC
        </p>
      )}

      {!showForm ? (
        <PrimaryButton onClick={() => (isConnected ? setShowForm(true) : openWalletModal())}>
          <span className="flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> {t("liquidity.addLiquidity")}
          </span>
        </PrimaryButton>
      ) : (
        <div className="space-y-3 mb-4">
          <input
            value={khype}
            onChange={(e) => setKhype(e.target.value)}
            placeholder="kHYPE amount"
            className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm"
          />
          <input
            value={usdc}
            onChange={(e) => setUsdc(e.target.value)}
            placeholder="USDC amount"
            className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm"
          />
          <PrimaryButton onClick={handleAdd} disabled={adding}>
            {adding ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t("liquidity.confirming")}
              </span>
            ) : (
              t("liquidity.confirmAdd")
            )}
          </PrimaryButton>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">{t("liquidity.yourPositions")}</h3>
        {!isConnected ? (
          <div className="p-4 rounded-xl border border-dashed border-zinc-700 text-center">
            <Droplets className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-500">{t("liquidity.connectToView")}</p>
          </div>
        ) : hasPosition ? (
          <div className="p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-white text-sm">kHYPE/USDC</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {parseFloat(lpBalance).toFixed(4)} LP · {t("liquidity.activePosition")}
                </p>
              </div>
              <span className="text-xs text-emerald-400 font-semibold">124.5% APR</span>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-zinc-600 text-zinc-300 text-xs hover:border-red-500/50 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {removing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {t("liquidity.removeLiquidity")}
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 text-center py-4 rounded-xl border border-dashed border-zinc-700">
            {t("liquidity.noPositions")}
          </p>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">{t("liquidity.pools")}</h3>
        <div className="space-y-2">
          {POOLS.map((pool) => (
            <div
              key={pool.pair}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl border",
                pool.featured ? "border-cyan-500/30 bg-cyan-500/5" : "border-zinc-700 bg-zinc-800/30"
              )}
            >
              <div>
                <p className="font-medium text-white text-sm">{pool.pair}</p>
                {pool.featured && (
                  <span className="text-[10px] text-cyan-400">{t("liquidity.featured")}</span>
                )}
              </div>
              <div className="text-right text-xs">
                <p className="text-emerald-400 font-semibold">{pool.apr} APR</p>
                <p className="text-zinc-500">
                  {pool.pair === "kHYPE/USDC" && reserves
                    ? `$${(parseFloat(reserves.reserveUSDC) * 2).toFixed(0)} TVL (live)`
                    : pool.tvl}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MainCard>
  );
}
