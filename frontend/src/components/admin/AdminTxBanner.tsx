"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { explorerTxUrl } from "@/lib/admin/explorer";
import { useAdminTx } from "@/lib/admin/AdminActionsContext";

export function AdminTxBanner() {
  const chainId = useEffectiveChainId();
  const { hash, isPending, isSuccess } = useAdminTx();

  if (!isPending && !hash) return null;

  const txUrl = hash ? explorerTxUrl(chainId, hash) : null;

  return (
    <div
      className="mb-4 px-4 py-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 flex items-center gap-3 text-sm"
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
      ) : (
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-cyan-300 font-medium">
          {isPending ? "Transaction pending — confirm in wallet" : isSuccess ? "Transaction confirmed" : "Submitted"}
        </p>
        {hash && (
          <p className="text-xs font-mono text-zinc-500 mt-0.5 truncate">{hash}</p>
        )}
      </div>
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cyan-400 hover:underline flex items-center gap-1 shrink-0"
        >
          Explorer <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}
