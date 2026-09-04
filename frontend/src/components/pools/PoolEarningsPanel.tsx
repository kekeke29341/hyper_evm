"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { usePoolEarnings } from "@/lib/hooks/usePoolEarnings";
import { TxHashLink } from "@/components/ui/TxHashLink";
import { EarningsTrendChart } from "@/components/charts/EarningsTrendChart";
import { MainCard, StatPill } from "@/components/ui/shared";
import { formatQuoteAmount } from "@/lib/pools/earnings";
import type { EarningsChartMode } from "@/lib/earnings/history";
import { cn } from "@/lib/utils";

export function PoolEarningsPanel() {
  const [chartMode, setChartMode] = useState<EarningsChartMode>("cumulative");
  const earnings = usePoolEarnings(chartMode);
  const { quoteSym, apr, chartData } = earnings;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <MainCard className="max-w-2xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <StatPill label="Pool APR" value={apr.isLoading ? "…" : apr.poolAprLabel} accent="violet" />
          <StatPill label="Your net APR" value={apr.isLoading ? "…" : apr.netAprLabel} accent="emerald" />
          <StatPill label="Pool TVL" value={apr.isLoading ? "…" : apr.poolTvlLabel} accent="cyan" />
          <StatPill label="24h volume" value={apr.isLoading ? "…" : apr.volume24hLabel} accent="cyan" />
        </div>
        <p className="text-[10px] text-zinc-600">
          Live fee APR from Project X pool (GeckoTerminal). Net APR = pool × 60% Cashdrop share.
          {apr.isLive ? "" : " (fallback / unavailable)"}
        </p>
      </MainCard>

      {earnings.hasPosition && (
        <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-emerald-300/80 uppercase tracking-wide font-medium">
                Accruing Cashdrop
              </p>
              <p className="text-2xl font-semibold text-emerald-300 tabular-nums tracking-tight mt-1">
                {earnings.pendingShareFormatted}
                <span className="text-sm text-emerald-400/70 ml-1.5 font-medium">{quoteSym}</span>
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-400/80 shrink-0 mt-1" />
          </div>
          <p className="text-[10px] text-zinc-500 mt-3 leading-relaxed">
            Your share of on-chain pending rewards (updates after harvest). Paid in {quoteSym} daily ~JST
            9:00.
          </p>
        </div>
      )}

      <MainCard className="max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Earnings ({quoteSym})</h3>
          <div className="flex gap-1">
            {(["cumulative", "daily", "monthly"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChartMode(m)}
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded-md border capitalize",
                  chartMode === m
                    ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                    : "border-zinc-700 text-zinc-500"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatPill
            label="Total earned"
            value={`${earnings.totalEarnedFormatted} ${quoteSym}`}
            accent="emerald"
          />
          <StatPill
            label="Position"
            value={
              earnings.hasPosition ? `${earnings.positionValueFormatted} ${quoteSym}` : "—"
            }
            accent="violet"
          />
        </div>

        <EarningsTrendChart data={chartData} valueSymbol={quoteSym} />

        {earnings.claims.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-zinc-500 font-medium">Cashdrop history</p>
            <ul className="space-y-1.5 max-h-40 overflow-y-auto">
              {[...earnings.claims].reverse().map((c) => (
                <li
                  key={`${c.t}-${c.txHash ?? ""}`}
                  className="flex items-center justify-between text-xs text-zinc-400 gap-2"
                >
                  <span className="tabular-nums shrink-0">
                    {new Date(c.t).toLocaleDateString()}
                  </span>
                  <span className="text-emerald-400/90 tabular-nums">
                    +{formatQuoteAmount(c.usdc)} {quoteSym}
                  </span>
                  {c.txHash ? (
                    <TxHashLink hash={c.txHash as `0x${string}`} className="truncate" />
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </MainCard>
    </div>
  );
}
