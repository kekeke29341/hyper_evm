"use client";

import Link from "next/link";
import { ArrowRight, TrendingUp, Wallet } from "lucide-react";
import { EarningsTrendChart } from "@/components/charts/EarningsTrendChart";
import { StatPill } from "@/components/ui/shared";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { PROJECT_X_POOL } from "@/lib/constants";
import { tabPath } from "@/lib/routes";
import type { EarningsChartMode } from "@/lib/earnings/history";
import { useCashdrop, useVaultStats } from "@/lib/hooks/useDeFi";
import { useEarningsDashboard } from "@/lib/hooks/useEarningsDashboard";
import { cn } from "@/lib/utils";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatMoney(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CHART_MODES: EarningsChartMode[] = ["cumulative", "yearly", "monthly", "daily"];

export function DashboardTab() {
  const { isConnected, openWalletModal } = useApp();
  const { t, locale } = useI18n();
  const { hasRewards, availableUsdc } = useCashdrop();
  const vaultStats = useVaultStats();
  const {
    hasPosition,
    positionValueUsd,
    vaultAddress,
    metrics,
    chartData,
    chartMode,
    setChartMode,
    monthlyRows,
    hasHistory,
    onChainSync,
    onChainLoading,
  } = useEarningsDashboard();

  const maxMonthly = Math.max(...monthlyRows.map((r) => r.value), 0.01);
  const showGettingStarted = isConnected && !hasPosition;
  const showClaimable = hasRewards;
  const claimableUsdc = availableUsdc;
  const pendingRewardsUsdc = vaultStats.pendingRewardsUsdc;
  const showPositionStats = isConnected && hasPosition;
  const aprDisplay =
    metrics.estimatedApr !== null
      ? `${metrics.estimatedApr.toFixed(1)}%`
      : hasPosition
        ? PROJECT_X_POOL.netAprEstimate
        : "—";

  return (
    <div className="max-w-6xl mx-auto w-full space-y-4">
      {vaultAddress && (
        <p className="text-[11px] text-zinc-500 px-1">
          Vault: <span className="text-zinc-400 font-mono">{truncateAddress(vaultAddress)}</span>
        </p>
      )}

      {showClaimable && (
        <Link
          href={tabPath("cashdrop")}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-left hover:bg-emerald-500/15 transition-colors"
        >
          <div>
            <p className="text-sm font-medium text-emerald-300">{t("dashboard.claimableNow")}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{t("cashdrop.window")}</p>
          </div>
          <span className="text-emerald-400 font-semibold tabular-nums shrink-0">
            {claimableUsdc} USDC <ArrowRight className="w-4 h-4 inline -mt-0.5" />
          </span>
        </Link>
      )}

      {pendingRewardsUsdc > 0 && (
        <p className="text-xs text-emerald-400/90 px-1">
          {t("dashboard.pendingPool")}: ${formatMoney(pendingRewardsUsdc)} USDC
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatPill
          label={t("dashboard.positionValue")}
          value={showPositionStats ? `$${formatMoney(positionValueUsd)}` : "—"}
          accent="cyan"
        />
        <StatPill
          label={t("dashboard.totalEarned")}
          value={hasHistory ? `$${formatMoney(metrics.totalEarned)}` : "$0.00"}
          accent="emerald"
        />
        <StatPill
          label={t("dashboard.earned24h")}
          value={hasHistory ? `$${formatMoney(metrics.earned24h)}` : "$0.00"}
          accent="emerald"
        />
        <StatPill
          label={t("dashboard.estimatedApr")}
          value={showPositionStats ? aprDisplay : "—"}
          accent="violet"
        />
        <StatPill
          label={t("dashboard.operatingDays")}
          value={
            metrics.operatingDays > 0
              ? locale === "ja"
                ? `${metrics.operatingDays}${t("dashboard.daysUnit")}`
                : `${metrics.operatingDays} days`
              : "—"
          }
          accent="cyan"
        />
        <StatPill
          label={t("dashboard.monthlyAverage")}
          value={hasHistory ? `$${formatMoney(metrics.monthlyAverage)}` : "—"}
          accent="violet"
        />
      </div>

      {!showPositionStats ? (
        <p className="text-[11px] text-zinc-600 px-1 -mt-2">
          {t("dashboard.aprConnectHint")} · {t("position.netApy")} {PROJECT_X_POOL.netAprEstimate} (
          {t("position.feeSplitFootnote")})
        </p>
      ) : metrics.estimatedApr === null ? (
        <p className="text-[11px] text-zinc-600 px-1 -mt-2">
          {t("dashboard.aprReferenceHint")} {PROJECT_X_POOL.netAprEstimate}
        </p>
      ) : null}

      {showGettingStarted && (
        <div className="card-glass rounded-2xl p-4 border border-cyan-500/20 bg-cyan-500/5">
          <p className="text-sm font-medium text-white mb-3">{t("dashboard.gettingStarted")}</p>
          <ol className="space-y-2 text-xs text-zinc-400">
            <li className="flex items-center justify-between gap-2">
              <span>1. {t("dashboard.stepDeposit")}</span>
              <Link href={tabPath("deposit")} className="text-cyan-400 hover:underline shrink-0">
                {t("tabs.deposit")} →
              </Link>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>2. {t("dashboard.stepPosition")}</span>
              <Link href={tabPath("liquidity")} className="text-cyan-400 hover:underline shrink-0">
                {t("tabs.liquidity")} →
              </Link>
            </li>
            <li>3. {t("dashboard.stepCashdrop")}</li>
          </ol>
        </div>
      )}

      <div className="card-glass rounded-2xl p-4 border border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">{t("dashboard.earningsTrend")}</h3>
          </div>
          <div className="flex flex-wrap gap-1">
            {CHART_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChartMode(mode)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                  chartMode === mode
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                )}
              >
                {t(`dashboard.chartMode.${mode}`)}
              </button>
            ))}
          </div>
        </div>
        <EarningsTrendChart data={chartData} />
        {!isConnected ? (
          <p className="mt-3 text-xs text-zinc-500 text-center">
            <button type="button" onClick={openWalletModal} className="text-cyan-400 hover:underline">
              {t("common.connectWallet")}
            </button>
            {" — "}
            {t("dashboard.connectHint")}
          </p>
        ) : null}
        <p className="mt-3 text-[10px] text-zinc-600 text-center leading-relaxed">
          {onChainSync ? t("dashboard.historyDisclaimerOnChain") : t("dashboard.historyDisclaimer")}
          {onChainLoading ? ` · ${t("common.loading")}` : null}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-glass rounded-2xl p-4 border border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-4">{t("dashboard.monthlyEarnings")}</h3>
          {hasHistory ? (
            <div className="space-y-3">
              {monthlyRows.map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">{row.label}</span>
                    <span className="text-emerald-400 tabular-nums">${formatMoney(row.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/70"
                      style={{ width: `${Math.max(2, (row.value / maxMonthly) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 text-center py-8">{t("dashboard.monthlyEmpty")}</p>
          )}
        </div>

        <div className="card-glass rounded-2xl p-4 border border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-4">
            {t("dashboard.positions")}{hasPosition ? " (1)" : ""}
          </h3>
          {!showPositionStats ? (
            <div className="p-6 rounded-xl border border-dashed border-zinc-700 text-center">
              <Wallet className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
              <p className="text-sm text-zinc-500">{t("dashboard.connectHint")}</p>
            </div>
          ) : hasPosition ? (
            <div className="p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5">
              <p className="font-medium text-white text-sm">
                {PROJECT_X_POOL.pair}{" "}
                <span className="text-zinc-500">{PROJECT_X_POOL.feeTier}</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500">{t("dashboard.positionValue")}</p>
                  <p className="text-white font-semibold tabular-nums">${formatMoney(positionValueUsd)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">{t("dashboard.totalEarned")}</p>
                  <p className="text-emerald-400 font-semibold tabular-nums">
                    ${formatMoney(metrics.totalEarned)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">{t("position.apy")}</p>
                  <p className="text-emerald-400">{PROJECT_X_POOL.referenceApr}</p>
                </div>
                <div>
                  <p className="text-zinc-500">{t("position.netApy")}</p>
                  <p className="text-zinc-300">{PROJECT_X_POOL.netAprEstimate}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 text-center py-8 rounded-xl border border-dashed border-zinc-700">
              {t("liquidity.noPositions")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
