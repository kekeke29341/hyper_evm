"use client";

import { TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAccruingRewards } from "@/lib/hooks/useAccruingRewards";
import { cn } from "@/lib/utils";

type AccruingRewardsCardProps = {
  className?: string;
  compact?: boolean;
};

export function AccruingRewardsCard({ className, compact = false }: AccruingRewardsCardProps) {
  const { t } = useI18n();
  const accruing = useAccruingRewards();

  if (!accruing.hasPosition) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent",
        compact ? "p-3" : "p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-emerald-300/80 uppercase tracking-wide font-medium">
            {t("cashdrop.accruingLabel")}
          </p>
          <p
            className={cn(
              "font-semibold text-emerald-300 tabular-nums tracking-tight",
              compact ? "text-xl mt-0.5" : "text-2xl sm:text-3xl mt-1"
            )}
          >
            {accruing.isLoading ? "…" : accruing.amountFormatted}
            <span className="text-sm sm:text-base text-emerald-400/70 ml-1.5 font-medium">USDC</span>
          </p>
        </div>
        <TrendingUp className={cn("text-emerald-400/80 shrink-0", compact ? "w-4 h-4 mt-0.5" : "w-5 h-5 mt-1")} />
      </div>

      {accruing.impliedNetAprPercent !== null && !accruing.isLoading ? (
        <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400", compact ? "mt-2" : "mt-3")}>
          <span className="tabular-nums">
            {t("cashdrop.projectedApr")}:{" "}
            <span className="text-emerald-400/90">{accruing.impliedNetAprPercent.toFixed(1)}%</span>
          </span>
          <span className="tabular-nums">
            {t("cashdrop.projectedDaily")}:{" "}
            <span className="text-emerald-400/90">${accruing.projectedDailyUsdc.toFixed(4)}</span>
          </span>
        </div>
      ) : null}

      {accruing.isAccruing && !accruing.isLoading ? (
        <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400", compact ? "mt-2" : "mt-3")}>
          <span className="tabular-nums">
            <span className="text-emerald-400/90">+{accruing.ratePerSecondFormatted}</span>{" "}
            {t("cashdrop.perSecond")}
          </span>
          <span className="tabular-nums">
            <span className="text-emerald-400/90">+{accruing.ratePerMinuteFormatted}</span>{" "}
            {t("cashdrop.perMinute")}
          </span>
        </div>
      ) : null}

      <p className={cn("text-[10px] text-zinc-500 leading-relaxed", compact ? "mt-2" : "mt-3")}>
        {accruing.isError
          ? t("cashdrop.accruingError")
          : accruing.usesExactEstimate
            ? t("cashdrop.accruingExactHint")
            : t("cashdrop.accruingHint")}
      </p>
    </div>
  );
}
