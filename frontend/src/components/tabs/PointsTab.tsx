"use client";

import { useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import { CHART_DATA, LEADERBOARD } from "@/lib/constants";
import { useOnChainPoints, useClaimPoints, useEpochCountdown, useCashdrop } from "@/lib/hooks/useDeFi";
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
  const { t } = useI18n();
  const { points: onChainPoints, hasDeployment, refetch } = useOnChainPoints();
  const { claim, isPending, isSuccess } = useClaimPoints();
  const cashdrop = useCashdrop();
  const displayPoints = hasDeployment && onChainPoints !== null ? onChainPoints : livePoints;
  const claimablePts = hasDeployment && onChainPoints !== null ? onChainPoints : 0;

  useEffect(() => {
    if (isSuccess) {
      showToast(t("points.claimSuccess"));
      refetch();
    }
  }, [isSuccess, showToast, refetch, t]);

  const handleClaim = async () => {
    if (!hasDeployment) {
      showToast(t("swap.deployHint"));
      return;
    }
    if (claimablePts <= 0) {
      showToast(t("points.earnHint"));
      return;
    }
    try {
      await claim();
    } catch {
      showToast(t("swap.swapFailed"));
    }
  };

  return (
    <MainCard className="max-w-lg">
      <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 mb-4">
        <p className="text-xs text-zinc-500">{t("points.dailyPool")}</p>
        <p className="text-sm text-zinc-400 mt-1">
          {t("points.nextDistribution")} <EpochCountdown />
        </p>
      </div>

      <p className="text-xs text-zinc-500">{t("points.yourPoints")}</p>
      <p className="text-4xl font-bold neon-text-green mt-1">
        {Math.floor(displayPoints).toLocaleString()} PTS
        {hasDeployment && onChainPoints !== null && (
          <span className="text-xs text-emerald-500/70 ml-2">{t("common.onChain")}</span>
        )}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
          {t("points.multiplierBadge")}
        </span>
      </div>
      <p className="text-sm text-cyan-400 mt-2 font-medium">{t("points.rank")}</p>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-1">{t("points.trendTitle")}</h3>
        <p className="text-[10px] text-zinc-600 mb-3">{t("points.trendSub")}</p>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={CHART_DATA}>
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

      <div className="mt-6 flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
        <div>
          <p className="text-xs text-zinc-500">{t("points.unclaimedToday")}</p>
          <p className="text-lg font-bold text-white">{Math.floor(claimablePts).toLocaleString()} PTS</p>
        </div>
        <button
          onClick={handleClaim}
          disabled={isPending || claimablePts <= 0}
          className="px-4 py-2 rounded-xl gradient-btn text-sm font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 flex items-center gap-2"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("common.claimAll")}
        </button>
      </div>

      <p className="mt-4 text-xs text-zinc-600 leading-relaxed">{t("points.earnHint")}</p>

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
        <h3 className="text-sm font-medium text-zinc-300 mb-3">{t("points.leaderboard")}</h3>
        <div className="space-y-1">
          {LEADERBOARD.map((row) => (
            <div
              key={row.rank}
              className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-zinc-800/50 text-sm"
            >
              <span className="text-zinc-500 w-6">#{row.rank}</span>
              <span className="text-zinc-300 flex-1 font-mono">{row.address}</span>
              <span className="text-zinc-400 mr-2">{row.points}</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-bold",
                  row.multiplier === "×3.0" && "bg-emerald-500/20 text-emerald-400",
                  row.multiplier === "×2.0" && "bg-cyan-500/20 text-cyan-400",
                  row.multiplier === "×1.5" && "bg-violet-500/20 text-violet-400"
                )}
              >
                {row.multiplier} {t("points.multiplier")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MainCard>
  );
}
