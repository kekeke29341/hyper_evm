"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type { ChartPoint } from "@/lib/points/history";

export function PointsTrendChart({ data }: { data: ChartPoint[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || data.length === 0) {
    return <div className="h-32 rounded-lg bg-zinc-800/30" aria-hidden />;
  }

  return (
    <div className="h-32 min-h-[8rem] w-full">
      <ResponsiveContainer width="100%" height="100%" minHeight={128}>
        <AreaChart data={data}>
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
  );
}
