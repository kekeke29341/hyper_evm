"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Gift,
  RefreshCw,
  Sprout,
} from "lucide-react";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { useAdminActivity, type ActivityItem, type ActivityKind } from "@/lib/admin/activity";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/admin/explorer";
import { cn } from "@/lib/utils";
import { AdminCard, StatBox } from "../AdminUi";

const KIND_META: Record<
  ActivityKind,
  { label: string; icon: typeof ArrowDownToLine; badge: string; dot: string }
> = {
  deposit: {
    label: "Deposit",
    icon: ArrowDownToLine,
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  withdraw: {
    label: "Withdraw",
    icon: ArrowUpFromLine,
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    dot: "bg-red-400",
  },
  payout: {
    label: "Cashdrop",
    icon: Gift,
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    dot: "bg-cyan-400",
  },
  harvest: {
    label: "Harvest",
    icon: Sprout,
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
  },
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtAmount(n: number, unit: string) {
  const v = n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return `${v} ${unit}`;
}

function relativeTime(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleString();
}

function ActivityRow({ item, chainId }: { item: ActivityItem; chainId: number }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const amounts = [
    item.usdc !== undefined && item.usdc > 0 ? fmtAmount(item.usdc, "USDC") : null,
    item.hype !== undefined && item.hype > 0 ? fmtAmount(item.hype, "HYPE") : null,
  ].filter(Boolean);
  const txUrl = explorerTxUrl(chainId, item.txHash);
  const addrUrl = item.account ? explorerAddressUrl(chainId, item.account) : null;

  return (
    <li className="relative pl-8 py-2.5">
      <span className={cn("absolute left-2 top-4 w-2.5 h-2.5 rounded-full ring-4 ring-zinc-900/80", meta.dot)} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0",
            meta.badge
          )}
        >
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>

        {item.account ? (
          addrUrl ? (
            <a
              href={addrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-zinc-300 hover:text-cyan-400"
            >
              {shortAddr(item.account)}
            </a>
          ) : (
            <span className="font-mono text-xs text-zinc-300">{shortAddr(item.account)}</span>
          )
        ) : (
          <span className="text-xs text-zinc-500">Vault fees → 7/60/33 split</span>
        )}

        <span className="text-sm font-semibold text-white">
          {amounts.length > 0 ? amounts.join(" + ") : "—"}
        </span>

        <span className="ml-auto flex items-center gap-2 shrink-0 text-[11px] text-zinc-500">
          {relativeTime(item.timestamp)}
          {txUrl && (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-cyan-400"
              aria-label="Open transaction in explorer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </span>
      </div>
    </li>
  );
}

export function ActivityFeed({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const chainId = useEffectiveChainId();
  const {
    items: allItems,
    summary,
    skippedRanges,
    isLoading,
    isFetching,
    refetch,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAdminActivity();

  const items = limit ? allItems.slice(0, limit) : allItems;

  return (
    <div>
      {!compact && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatBox
            label="Deposits in"
            value={fmtAmount(summary.depositUsdc, "USDC")}
            sub={summary.depositHype > 0 ? `+ ${fmtAmount(summary.depositHype, "HYPE")}` : "Scanned window"}
          />
          <StatBox
            label="Withdrawals out"
            value={fmtAmount(summary.withdrawUsdc, "USDC")}
            sub={summary.withdrawHype > 0 ? `+ ${fmtAmount(summary.withdrawHype, "HYPE")}` : "Scanned window"}
          />
          <StatBox label="Cashdrop payouts" value={fmtAmount(summary.payoutUsdc, "USDC")} sub="Sent to users" />
          <StatBox label="Fees harvested" value={fmtAmount(summary.harvestUserUsdc, "USDC")} sub="Before 7/60/33 split" />
          <StatBox label="Active wallets" value={String(summary.uniqueWallets)} sub="In listed events" />
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500">
          {summary
            ? `${items.length} events · last ~${summary.scannedBlocks.toLocaleString()} blocks${
                skippedRanges > 0 ? ` · ${skippedRanges} ranges skipped (RPC limit)` : ""
              }`
            : "On-chain events"}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white disabled:opacity-50 px-2 py-1 rounded-md hover:bg-zinc-800/60"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-zinc-900/60 border border-zinc-800/60" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-zinc-500 py-4">Could not load on-chain events from the RPC. Try refresh.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">
          No deposits, withdrawals, harvests or Cashdrop payouts in the scanned block window.
        </p>
      ) : (
        <ul className="relative divide-y divide-zinc-800/60 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-zinc-800">
          {items.map((item, i) => (
            <ActivityRow key={`${item.txHash}:${item.kind}:${i}`} item={item} chainId={chainId} />
          ))}
        </ul>
      )}

      {!compact && hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-3 w-full py-2 rounded-lg text-xs font-semibold bg-zinc-800/60 border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Scanning older blocks…" : "Scan older blocks"}
        </button>
      )}
    </div>
  );
}

export function ActivityPanel() {
  return (
    <div className="space-y-4">
      <AdminCard
        title="Fund flows & user activity"
        subtitle="Vault deposits / withdrawals, fee harvests and Cashdrop payouts — read directly from chain events"
      >
        <ActivityFeed />
      </AdminCard>

      <AdminCard title="Legend">
        <ul className="text-xs text-zinc-400 space-y-1.5">
          <li>
            <span className="text-emerald-400 font-semibold">Deposit</span> — a user added USDC or HYPE to the vault
          </li>
          <li>
            <span className="text-red-400 font-semibold">Withdraw</span> — a user redeemed vault shares for USDC / HYPE
          </li>
          <li>
            <span className="text-amber-400 font-semibold">Harvest</span> — keeper collected LP fees (split 7% ops / 60%
            users / 33% owner)
          </li>
          <li>
            <span className="text-cyan-400 font-semibold">Cashdrop</span> — daily USDC payout sent directly to a user
            wallet
          </li>
        </ul>
      </AdminCard>
    </div>
  );
}
