"use client";

import Link from "next/link";
import { ChevronRight, Droplets } from "lucide-react";
import { getPoolDeployments } from "@/lib/contracts";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { usePoolApr } from "@/lib/hooks/usePoolApr";
import { poolRangeLabel } from "@/lib/pools/format";
import { PoolShell } from "@/components/pools/PoolShell";
import { MainCard } from "@/components/ui/shared";

function PoolCard({
  poolKey,
  label,
  baseSymbol,
  quoteSymbol,
  rangeLabel,
}: {
  poolKey: string;
  label: string;
  baseSymbol?: string;
  quoteSymbol?: string;
  rangeLabel: string;
}) {
  const apr = usePoolApr(poolKey);
  const q = quoteSymbol === "WHYPE" ? "HYPE" : quoteSymbol;

  return (
    <Link
      href={`/pools/${poolKey}`}
      className="flex items-center gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-violet-500/40 hover:bg-violet-500/5 transition-colors group"
    >
      <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
        <Droplets className="w-5 h-5 text-violet-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white group-hover:text-violet-200 transition-colors">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {baseSymbol}/{q} · {rangeLabel} · 0.3% fee
        </p>
        <p className="text-[11px] text-zinc-400 mt-1 tabular-nums">
          {apr.isLoading ? (
            "APR …"
          ) : (
            <>
              <span className="text-emerald-400/90">{apr.netAprLabel}</span> net
              <span className="text-zinc-600 mx-1">·</span>
              {apr.poolTvlLabel} TVL
              <span className="text-zinc-600 mx-1">·</span>
              {apr.volume24hLabel} 24h
            </>
          )}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 shrink-0" />
    </Link>
  );
}

export function PoolPicker() {
  const chainId = useEffectiveChainId();
  const pools = getPoolDeployments(chainId);

  return (
    <PoolShell title="HYPE Pools" subtitle="Managed LP on Project X · ±5% range">
      <MainCard className="max-w-2xl">
        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          These vaults are quoted in HYPE (WHYPE). Cashdrop rewards are paid in HYPE. The original{" "}
          <Link href="/" className="text-cyan-400 hover:underline">
            HYPE/USDC vault
          </Link>{" "}
          is unchanged on the main app.
        </p>

        {pools.length === 0 ? (
          <p className="text-sm text-zinc-500 py-8 text-center">No HYPE-quoted pools on this network.</p>
        ) : (
          <ul className="space-y-2">
            {pools.map((pool) => (
              <li key={pool.key}>
                <PoolCard
                  poolKey={pool.key}
                  label={pool.label ?? pool.key}
                  baseSymbol={pool.baseSymbol}
                  quoteSymbol={pool.quoteSymbol}
                  rangeLabel={poolRangeLabel(pool)}
                />
              </li>
            ))}
          </ul>
        )}
      </MainCard>
    </PoolShell>
  );
}
