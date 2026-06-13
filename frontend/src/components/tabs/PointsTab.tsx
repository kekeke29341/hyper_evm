"use client";

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import { CHART_DATA } from "@/lib/constants";
import { useOnChainPoints, useEpochCountdown, useCashdrop } from "@/lib/hooks/useDeFi";
import {
  usePointsLeaderboard,
  usePointsHistoryChart,
  useUserPointsRank,
  useEpochFeeContribution,
} from "@/lib/hooks/usePointsAnalytics";
import { multiplierBadgeClass } from "@/lib/points/multiplier";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { MainCard } from "@/components/ui/shared";
import { cn } from "@/lib/utils";

function EpochCountdown() {
  const epoch = useEpochCountdown();
  if (!epoch) return <span className="text-zinc-500">—</span>;
  return (
    <span className="text-cyan-400 font-mono text-sm">{epoch.formatted}</span>
  );
}

export function PointsTab() {
  const { livePoints, showToast } = useApp();
  const { t, locale } = useI18n();
  const { points: onChainPoints, hasDeployment } = useOnChainPoints();
  const cashdrop = useCashdrop();
  const { contribution: epochContribution } = useEpochFeeContribution();
  const { data: leaderboard, isLoading: leaderboardLoading } = usePointsLeaderboard(5);
  const { rank, multiplierLabel, inTop100 } = useUserPointsRank(leaderboard);
  const displayPoints = hasDeployment && onChainPoints !== null ? onChainPoints : livePoints;
  const { chart, hasHistory } = usePointsHistoryChart(
    hasDeployment && onChainPoints !== null ? onChainPoints : null
  );

  const chartData = hasHistory ? chart : CHART_DATA;
  const chartIsLive = hasDeployment && hasHistory;

  const rankText =
    rank !== null
      ? t("points.rankActive")
          .replace("{rank}", String(rank))
          .replace("{multiplier}", multiplierLabel.replace("×", ""))
      : hasDeployment
        ? t("points.rankUnranked")
        : t("points.rank");

  return (
    <MainCard className="max-w-lg">
      <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 mb-4">
        <p className="text-xs text-zinc-500">{t("points.dailyPool")}</p>
        <p className="text-sm text-zinc-400 mt-1">
          {t("points.nextDistribution")} <EpochCountdown />
        </p>
        {hasDeployment && epochContribution !== null && epochContribution > 0 && (
          <p className="text-[11px] text-emerald-500/80 mt-2">
            {t("points.epochContribution")}: {Math.floor(epochContribution).toLocaleString()} PTS
          </p>
        )}
      </div>

      <p className="text-xs text-zinc-500">{t("points.yourPoints")}</p>
      <p className="text-4xl font-bold neon-text-green mt-1">
        {Math.floor(displayPoints).toLocaleString()} PTS
        {hasDeployment && onChainPoints !== null && (
          <span className="text-xs text-emerald-500/70 ml-2">{t("common.onChain")}</span>
        )}
      </p>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "text-xs px-2 py-1 rounded-full border",
            inTop100
              ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
              : "bg-zinc-800 text-zinc-500 border-zinc-700"
          )}
        >
          {t("points.multiplierBadge")}
        </span>
      </div>
      <p className="text-sm text-cyan-400 mt-2 font-medium">{rankText}</p>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-1">{t("points.trendTitle")}</h3>
        <p className="text-[10px] text-zinc-600 mb-3">
          {chartIsLive ? t("points.trendOnChain") : t("points.trendSub")}
        </p>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Area type="monotone" dataKey="pts" stroke="#39ff14" fill="url(#grad)" strokeWidth={2} />
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#39ff14" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#39ff14" stopOpacity={0} />
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="mt-6 text-xs text-zinc-600 leading-relaxed">{t("points.earnHint")}</p>

      {cashdrop.hasDeployment && (
        <div className="mt-4 p-3 rounded-xl border border-violet-500/20 bg-violet-500/5">
          <p className="text-xs text-zinc-500">{t("points.cashdropAvailable")}</p>
          <p className="text-lg font-bold text-white mt-1">{cashdrop.availableUsdc} USDC</p>
          {cashdrop.hasRewards && (
            <button
              type="button"
              onClick={() =>
                cashdrop
                  .claim()
                  .then(() => showToast(t("points.cashdropSuccess")))
                  .catch(() => showToast(t("swap.swapFailed")))
              }
              disabled={cashdrop.isPending}
              className="mt-2 text-xs px-3 py-1.5 rounded-lg gradient-btn font-semibold disabled:opacity-50"
            >
              {cashdrop.isPending ? t("common.loading") : t("common.claimAll")}
            </button>
          )}
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-1">{t("points.leaderboard")}</h3>
        <p className="text-[10px] text-zinc-600 mb-3">{t("points.leaderboardSub")}</p>
        {leaderboardLoading ? (
          <div className="flex items-center gap-2 py-4 text-zinc-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : !leaderboard?.length ? (
          <p className="text-sm text-zinc-500 py-4 text-center border border-dashed border-zinc-700 rounded-xl">
            {hasDeployment ? t("points.leaderboardEmpty") : t("points.leaderboardDemo")}
          </p>
        ) : (
          <div className="space-y-1">
            {leaderboard.map((row) => (
              <div
                key={row.rank}
                className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-zinc-800/50 text-sm"
              >
                <span className="text-zinc-500 w-6">#{row.rank}</span>
                <span className="text-zinc-300 flex-1 font-mono">{row.address}</span>
                <span className="text-zinc-400 mr-2">
                  {Math.floor(row.points).toLocaleString(locale === "ja" ? "ja-JP" : "en-US")}
                </span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-bold",
                    multiplierBadgeClass(parseFloat(row.multiplier.replace("×", "")))
                  )}
                >
                  {row.multiplier} {t("points.multiplier")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainCard>
  );
}
