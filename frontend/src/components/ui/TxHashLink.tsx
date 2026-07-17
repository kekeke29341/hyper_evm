"use client";

import { ExternalLink } from "lucide-react";
import { explorerTxUrl } from "@/lib/explorer";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { cn } from "@/lib/utils";

export function TxHashLink({
  hash,
  className,
  label,
}: {
  hash: string;
  className?: string;
  /** Short label; defaults to first 10 chars of hash */
  label?: string;
}) {
  const chainId = useEffectiveChainId();
  const url = explorerTxUrl(chainId, hash);
  const display = label ?? `${hash.slice(0, 10)}…`;

  if (!url) {
    return <span className={cn("font-mono text-zinc-400 text-xs", className)}>{display}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs text-cyan-400 hover:text-cyan-300 hover:underline",
        className
      )}
    >
      {display}
      <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
    </a>
  );
}
