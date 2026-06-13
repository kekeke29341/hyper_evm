"use client";

import { useI18n } from "@/lib/i18n";
import type { RebalanceEvent } from "@/lib/liquidity/history";

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RebalanceHistoryPanel({ events }: { events: RebalanceEvent[] }) {
  const { t } = useI18n();

  return (
    <div className="card-glass rounded-2xl p-4 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{t("position.rebalanceHistory")}</h3>
        <span className="text-[10px] text-zinc-500">{events.length} {t("position.events")}</span>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4 text-center">{t("position.noHistory")}</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {events.map((e) => (
            <div
              key={e.id}
              className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800 text-xs space-y-1"
            >
              <div className="flex justify-between text-zinc-400">
                <span>{formatRelative(e.timestamp)}</span>
                <span className="text-zinc-500">{e.action}</span>
              </div>
              <p className="text-zinc-300 tabular-nums">
                {t("position.price")}: {e.price.toLocaleString()} · ±{e.rangePct}%
              </p>
              <p className="text-zinc-500 tabular-nums">
                {e.lower.toLocaleString()} – {e.upper.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
