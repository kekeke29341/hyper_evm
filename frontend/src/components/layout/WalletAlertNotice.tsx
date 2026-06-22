"use client";

import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function WalletAlertNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();

  return (
    <section
      aria-label={t("walletAlert.title")}
      className={
        compact
          ? "rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3"
          : "max-w-2xl mx-auto mb-5 rounded-2xl border border-cyan-500/20 bg-black/70 p-4 sm:p-5 shadow-[0_0_40px_rgba(34,211,238,0.08)]"
      }
    >
      <div className={compact ? "flex items-start gap-2" : "flex items-start gap-3"}>
        <div
          className={
            compact
              ? "mt-0.5 rounded-lg bg-cyan-400/10 p-1.5 text-cyan-300"
              : "rounded-2xl bg-cyan-400/10 p-2.5 text-cyan-300"
          }
        >
          <ShieldCheck className={compact ? "h-4 w-4" : "h-6 w-6"} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={compact ? "text-xs font-semibold text-cyan-100" : "text-base font-semibold text-white"}>
            {t("walletAlert.title")}
          </p>
          <p className={compact ? "mt-1 text-[11px] leading-relaxed text-zinc-400" : "mt-2 text-sm leading-relaxed text-zinc-300"}>
            {t("walletAlert.body")}
          </p>
          {!compact && (
            <div className="mt-3 grid gap-2 text-xs leading-relaxed text-zinc-400 md:grid-cols-3">
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">{t("walletAlert.pointMembership")}</p>
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">{t("walletAlert.pointCustody")}</p>
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">{t("walletAlert.pointOperating")}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
