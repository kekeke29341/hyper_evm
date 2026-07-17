"use client";

import { Loader2 } from "lucide-react";
import { TxHashLink } from "@/components/ui/TxHashLink";
import { explorerAddressUrl } from "@/lib/explorer";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useI18n } from "@/lib/i18n";
import type { ReferralPayoutRecord } from "@/lib/referral/commissionHistory";
import { shortenAddress } from "@/lib/utils";

function formatUsdc(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PayoutTable({
  rows,
  loading,
  emptyLabel,
  amountHeader,
}: {
  rows: ReferralPayoutRecord[];
  loading: boolean;
  emptyLabel: string;
  amountHeader: string;
}) {
  const { t, locale } = useI18n();

  if (loading && rows.length === 0) {
    return (
      <p className="text-xs text-zinc-500 py-4 text-center">
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
        {t("common.loading")}
      </p>
    );
  }

  if (!rows.length) {
    return <p className="text-xs text-zinc-500 py-4 text-center">{emptyLabel}</p>;
  }

  return (
    <div className="rounded-xl border border-zinc-700 overflow-x-auto">
      <table className="w-full min-w-[18rem] text-sm">
        <thead className="bg-zinc-800/80 text-zinc-500 text-xs">
          <tr>
            <th className="py-2 px-3 text-left whitespace-nowrap">{t("affiliate.payoutDate")}</th>
            <th className="py-2 px-3 text-right whitespace-nowrap">{amountHeader}</th>
            <th className="py-2 px-3 text-right whitespace-nowrap">{t("affiliate.payoutTx")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.txHash ?? row.t} className="border-t border-zinc-800">
              <td className="py-2 px-3 text-zinc-400 text-xs whitespace-nowrap">
                {formatDate(row.t, locale)}
              </td>
              <td className="py-2 px-3 text-right text-emerald-400 font-medium tabular-nums whitespace-nowrap">
                {formatUsdc(row.usdc)} USDC
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
  );
}

export function ReferralPayoutHistory({
  boundReferrer,
  referrerHistory,
  referrerContributionHistory,
  onChainLoading,
  hasReferrerHistory,
  hasContributionHistory,
}: {
  boundReferrer: `0x${string}` | null | undefined;
  referrerHistory: ReferralPayoutRecord[];
  referrerContributionHistory: ReferralPayoutRecord[];
  onChainLoading: boolean;
  hasReferrerHistory: boolean;
  hasContributionHistory: boolean;
}) {
  const { t } = useI18n();
  const chainId = useEffectiveChainId();
  const referrerExplorer =
    boundReferrer ? explorerAddressUrl(chainId, boundReferrer) : null;

  if (!hasContributionHistory && !hasReferrerHistory) return null;

  return (
    <div className="space-y-6 pt-4 border-t border-zinc-800">
      {hasContributionHistory && boundReferrer && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-1">{t("affiliate.referrerEarningsTitle")}</h3>
          <p className="text-[10px] text-zinc-600 mb-3 leading-relaxed">
            {t("affiliate.referrerEarningsSub")}{" "}
            {referrerExplorer ? (
              <a
                href={referrerExplorer}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-cyan-400/90 hover:underline"
              >
                {shortenAddress(boundReferrer)}
              </a>
            ) : (
              <span className="font-mono text-zinc-500">{shortenAddress(boundReferrer)}</span>
            )}
          </p>
          <PayoutTable
            rows={referrerContributionHistory}
            loading={onChainLoading}
            emptyLabel={t("affiliate.referrerEarningsEmpty")}
            amountHeader={t("affiliate.referrerEarningsAmount")}
          />
          <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
            {t("affiliate.payoutHistoryNote")}
          </p>
        </div>
      )}

      {hasReferrerHistory && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-1">{t("affiliate.yourCommissionHistory")}</h3>
          <p className="text-[10px] text-zinc-600 mb-3">{t("affiliate.yourCommissionHistorySub")}</p>
          <PayoutTable
            rows={referrerHistory}
            loading={onChainLoading}
            emptyLabel={t("affiliate.commissionHistoryEmpty")}
            amountHeader={t("affiliate.commissionAmount")}
          />
          <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
            {t("affiliate.payoutHistoryNote")}
          </p>
        </div>
      )}
    </div>
  );
}
