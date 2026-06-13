"use client";

import { cn } from "@/lib/utils";

export function PriceRangeBar({
  lower,
  upper,
  current,
  inRange,
}: {
  lower: number;
  upper: number;
  current: number;
  inRange: boolean;
}) {
  const span = upper - lower;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((current - lower) / span) * 100)) : 50;

  return (
    <div className="space-y-2">
      <div className="relative h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn(
            "absolute inset-y-0 left-0 right-0 rounded-full",
            inRange ? "bg-gradient-to-r from-emerald-500/40 via-cyan-500/50 to-emerald-500/40" : "bg-amber-500/30"
          )}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-cyan-400 shadow-lg"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500 tabular-nums">
        <span>{lower.toLocaleString()}</span>
        <span className="text-zinc-400">{current.toLocaleString()}</span>
        <span>{upper.toLocaleString()}</span>
      </div>
    </div>
  );
}
