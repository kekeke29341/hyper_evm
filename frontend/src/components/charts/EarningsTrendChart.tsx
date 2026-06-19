"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EarningsChartPoint } from "@/lib/earnings/history";
import { useI18n } from "@/lib/i18n";

function formatUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(value < 10 ? 2 : 0)}`;
}

export function EarningsTrendChart({ data }: { data: EarningsChartPoint[] }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-64 rounded-xl bg-zinc-800/30" aria-hidden />;
  }

  if (data.length === 0) {
    return (
      <div className="h-64 rounded-xl border border-dashed border-zinc-700 flex items-center justify-center">
        <p className="text-sm text-zinc-500 px-4 text-center">{t("dashboard.chartEmpty")}</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 0.01);

  return (
    <div className="h-64 min-h-[16rem] w-full">
      <ResponsiveContainer width="100%" height="100%" minHeight={256}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={formatUsd}
            domain={[0, maxVal * 1.1]}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(value) => [
              formatUsd(typeof value === "number" ? value : Number(value ?? 0)),
              t("dashboard.chartValue"),
            ]}
          />
          <defs>
            <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke="#34d399"
            fill="url(#earningsGrad)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#34d399" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
