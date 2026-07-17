"use client";

import { Loader2 } from "lucide-react";
import { TxHashLink } from "@/components/ui/TxHashLink";
import { useEarningsDashboard } from "@/lib/hooks/useEarningsDashboard";
import { useCashdropPayoutClaims } from "@/lib/hooks/useCashdropPayoutClaims";
import { useI18n } from "@/lib/i18n";

function formatUsdc(n: number): string {
  if (n > 0 && n < 0.01) return n.toFixed(6);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CashdropPayoutHistory() {
  const { t, locale } = useI18n();
  const { hasHistory, onChainLoading } = useEarningsDashboard();
  const { claims, isLoading } = useCashdropPayoutClaims();

  const rows = [...claims].sort((a, b) => b.t - a.t).slice(0, 14);

  if (!hasHistory && !onChainLoading && !isLoading) return null;

  return (
    <div className="card-glass rounded-2xl p-4 border border-zinc-800">
      <h3 className="text-sm font-semibold text-white mb-1">{t("dashboard.payoutHistory")}</h3>
      <p className="text-[10px] text-zinc-600 mb-4">{t("dashboard.payoutHistoryOnChain")}</p>

      {(onChainLoading || isLoading) && rows.length === 0 ? (
        <p className="text-xs text-zinc-500 py-6 text-center">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
          {t("common.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">{t("dashboard.payoutHistoryEmpty")}</p>
      ) : (
        <div className="rounded-xl border border-zinc-700 overflow-x-auto">
          <table className="w-full min-w-[18rem] text-sm">
            <thead className="bg-zinc-800/80 text-zinc-500 text-xs">
              <tr>
                <th className="py-2 px-3 text-left">{t("affiliate.payoutDate")}</th>
                <th className="py-2 px-3 text-right">USDC</th>
                <th className="py-2 px-3 text-right">{t("affiliate.payoutTx")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.txHash ?? row.t} className="border-t border-zinc-800">
                  <td className="py-2 px-3 text-zinc-400 text-xs whitespace-nowrap">
                    {formatDate(row.t, locale)}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-medium tabular-nums">
                    {formatUsdc(row.usdc)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {row.txHash ? (
                      <TxHashLink hash={row.txHash} />
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
