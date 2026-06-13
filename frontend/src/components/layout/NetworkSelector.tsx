"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useChainId } from "wagmi";
import { useWallet } from "@/lib/hooks/useWallet";
import { defaultChain, SUPPORTED_CHAINS } from "@/lib/wagmi/config";
import { getChainDeploymentMeta } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export function NetworkSelector({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const chainId = useChainId();
  const { isConnected, switchNetwork, isSwitching } = useWallet();
  const [open, setOpen] = useState(false);

  const displayChainId = isConnected ? chainId : defaultChain.id;
  const current = SUPPORTED_CHAINS.find((c) => c.id === displayChainId) ?? SUPPORTED_CHAINS[0];
  const meta = getChainDeploymentMeta(displayChainId);
  const displayLabel = compact ? current.shortLabel : current.label;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isSwitching}
        aria-label={current.label}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700 text-zinc-300 hover:border-cyan-500/40 transition-colors min-h-[36px]"
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            meta.live ? "bg-emerald-400" : meta.configured ? "bg-amber-400" : "bg-zinc-500"
          )}
        />
        <span className="truncate max-w-[5.5rem] sm:max-w-none">{displayLabel}</span>
        <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-1 z-40 min-w-[200px] py-1 rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl">
            {SUPPORTED_CHAINS.map((c) => {
              const itemMeta = getChainDeploymentMeta(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={async () => {
                    setOpen(false);
                    await switchNetwork(c.id);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors",
                    chainId === c.id ? "text-cyan-400" : "text-zinc-400"
                  )}
                >
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-[10px] text-zinc-600">{c.description}</span>
                  {itemMeta.configured && !itemMeta.live && (
                    <span className="block text-[10px] text-amber-500/80 mt-0.5">Deploy contracts first</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
