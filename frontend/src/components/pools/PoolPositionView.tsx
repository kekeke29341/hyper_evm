"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Plus, Vault } from "lucide-react";
import { useApp } from "@/lib/store";
import { usePoolContext } from "@/lib/pools/PoolContext";
import {
  usePoolStats,
  usePoolVaultBalance,
  usePoolWithdraw,
  usePoolVaultLive,
} from "@/lib/hooks/usePoolVault";
import {
  displayBaseSymbol,
  displayQuoteSymbol,
  poolRangeLabel,
} from "@/lib/pools/format";
import { PoolShell } from "@/components/pools/PoolShell";
import { PoolDepositModal } from "@/components/pools/PoolDepositModal";
import { PoolEarningsPanel } from "@/components/pools/PoolEarningsPanel";
import { MainCard, StatPill } from "@/components/ui/shared";
import { explorerAddressUrl } from "@/lib/explorer";
import { cn } from "@/lib/utils";

export function PoolPositionView() {
  const { pool, chainId } = usePoolContext();
  const { isConnected, openWalletModal, showToast } = useApp();
  const stats = usePoolStats();
  const balance = usePoolVaultBalance();
  const { withdraw, isPending: withdrawing, isSuccess: withdrawSuccess } = usePoolWithdraw();
  const live = usePoolVaultLive();

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawShares, setWithdrawShares] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");

  const quoteSym = displayQuoteSymbol(pool);
  const baseSym = displayBaseSymbol(pool);
  const vaultUrl = explorerAddressUrl(chainId, pool.vault);

  useEffect(() => {
    if (withdrawSuccess) {
      showToast("Withdraw successful");
      stats.refetch();
      balance.refetch();
    }
  }, [withdrawSuccess, showToast, stats, balance]);

  const openDeposit = () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    setDepositOpen(true);
  };

  const handleWithdraw = async () => {
    const shares = withdrawShares || balance.shares;
    if (!shares || parseFloat(shares) <= 0) return;
    await withdraw(shares);
  };

  const refetchAll = () => {
    stats.refetch();
    balance.refetch();
  };

  return (
    <PoolShell
      title={pool.label ?? pool.key}
      subtitle={`${baseSym}/HYPE · Managed LP ${poolRangeLabel(pool)}`}
    >
      <div className="space-y-4 max-w-2xl mx-auto">
        <MainCard className="max-w-2xl">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <p className="text-xs text-zinc-500">Pool price</p>
              <p className="text-lg font-semibold text-white tabular-nums">
                {stats.priceLoading ? "…" : stats.priceLabel}
              </p>
            </div>
            {vaultUrl && (
              <a
                href={vaultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-500 hover:text-violet-400 flex items-center gap-1 shrink-0"
              >
                Vault <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            <StatPill
              label="Vault TVL"
              value={
                stats.totalAssets > 0
                  ? `${stats.totalAssets.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${quoteSym}`
                  : "—"
              }
              accent="violet"
            />
            <StatPill
              label="LP range"
              value={
                stats.tickLower != null && stats.tickUpper != null
                  ? `${stats.tickLower} … ${stats.tickUpper}`
                  : poolRangeLabel(pool)
              }
              accent="cyan"
            />
            <StatPill
              label="Cashdrop"
              value={quoteSym}
              accent="emerald"
            />
          </div>

          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Rewards are distributed in HYPE daily (JST 7–9). TWAP entry guard is active (
            {pool.twapWindow ?? 900}s window).
          </p>
        </MainCard>

        <div className="card-glass rounded-2xl p-4 border border-zinc-800 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Your position</h3>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1",
                live
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-zinc-800 text-zinc-500 border-zinc-700"
              )}
            >
              <Vault className="w-3 h-3" /> {live ? "Live" : "Unavailable"}
            </span>
          </div>

          <div className="flex gap-1 mb-3">
            {(["deposit", "withdraw"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 py-1.5 text-xs rounded-lg border transition-colors capitalize",
                  mode === m
                    ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                    : "border-zinc-700 text-zinc-500"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {!isConnected ? (
            <button type="button" onClick={openWalletModal} className="w-full py-3 gradient-btn rounded-xl text-sm font-semibold">
              Connect wallet
            </button>
          ) : balance.hasPosition ? (
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
                <p className="text-zinc-600">Shares</p>
                <p className="text-white tabular-nums">{parseFloat(balance.shares).toFixed(4)}</p>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
                <p className="text-zinc-600">Value (~{quoteSym})</p>
                <p className="text-violet-400 tabular-nums">
                  {balance.valueQuote.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 mb-3">No vault shares yet. Deposit {quoteSym} or {baseSym} to open a position.</p>
          )}

          {mode === "withdraw" && balance.hasPosition && (
            <div className="mb-3">
              <input
                type="text"
                inputMode="decimal"
                value={withdrawShares}
                onChange={(e) => setWithdrawShares(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Shares to withdraw"
                className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm outline-none focus:border-violet-500/50"
              />
              <button
                type="button"
                onClick={() => setWithdrawShares(balance.shares)}
                className="mt-1 text-[10px] text-violet-400"
              >
                MAX
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={!live || (mode === "withdraw" && (!balance.hasPosition || withdrawing))}
            onClick={() => (mode === "deposit" ? openDeposit() : handleWithdraw())}
            className={cn(
              "w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2",
              live && !(mode === "withdraw" && !balance.hasPosition)
                ? "gradient-btn"
                : "border border-zinc-700 text-zinc-500 cursor-not-allowed"
            )}
          >
            {withdrawing && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "deposit" ? (
              <>
                <Plus className="w-4 h-4" /> Deposit
              </>
            ) : (
              "Withdraw"
            )}
          </button>
        </div>

        <PoolEarningsPanel />

        <p className="text-center text-[11px] text-zinc-600">
          <Link href="/" className="text-cyan-500/80 hover:text-cyan-400">
            Main app (HYPE/USDC)
          </Link>
          {" · "}
          <Link href="/pools" className="text-violet-500/80 hover:text-violet-400">
            All pools
          </Link>
        </p>
      </div>

      <PoolDepositModal open={depositOpen} onClose={() => setDepositOpen(false)} onSuccess={refetchAll} />
    </PoolShell>
  );
}
