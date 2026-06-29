"use client";

import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { formatUnits } from "viem";
import { useAdminAnalytics, useAdminHealth } from "@/lib/hooks/useAdmin";
import { formatRefPriceUsd } from "@/lib/admin/health";
import { explorerTxUrl } from "@/lib/admin/explorer";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { AdminCard, StatBox } from "../AdminUi";

function StatusPill({ status }: { status: "ok" | "warn" | "critical" | "unknown" }) {
  const styles = {
    ok: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    warn: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    critical: "text-red-400 bg-red-500/10 border-red-500/30",
    unknown: "text-zinc-400 bg-zinc-800 border-zinc-700",
  };
  const labels = { ok: "OK", warn: "Warning", critical: "Critical", unknown: "Unknown" };
  const Icon = status === "ok" ? CheckCircle2 : status === "unknown" ? HelpCircle : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${styles[status]}`}>
      <Icon className="w-3 h-3" />
      {labels[status]}
    </span>
  );
}

export function HealthPanel() {
  const chainId = useEffectiveChainId();
  const health = useAdminHealth();
  const {
    vaultPaused,
    airdropPaused,
    maxRebalanceDeviationBps,
    convertHypeFeesToUsdc,
    feeSwapSlippageBps,
    swapRouter,
  } = useAdminAnalytics();

  const last = health.deployment?.lastCashdropDistribution;
  const holders = health.deployment?.vaultShareHolders?.length ?? 0;
  const entries = health.deployment?.airdropEntries?.length ?? 0;
  const entriesTotal =
    health.deployment?.airdropEntries?.reduce((s, e) => s + BigInt(e.amount), 0n) ?? 0n;

  if (!health.deployment) {
    return (
      <AdminCard title="Health">
        <p className="text-sm text-zinc-500">No deployment for chain {chainId}.</p>
      </AdminCard>
    );
  }

  return (
    <div className="space-y-4">
      <AdminCard title="System health" subtitle="Live on-chain checks (30s refresh)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            label="Vault"
            value={vaultPaused ? "Paused" : "Active"}
            sub={vaultPaused ? "Deposits / withdraws blocked" : "Operating"}
          />
          <StatBox
            label="Cashdrop"
            value={airdropPaused ? "Paused" : "Active"}
            sub={airdropPaused ? "Auto payouts blocked" : "distributeRewards enabled"}
          />
          <StatBox
            label="Oracle ↔ Pool"
            value={
              health.oraclePoolDevBps !== null ? `${health.oraclePoolDevBps.toFixed(2)} bps` : "—"
            }
            sub={`Limit ${health.maxDevBps} bps (5% default)`}
          />
          <StatBox
            label="LP in range"
            value={
              health.inRange === null
                ? "—"
                : health.inRange
                  ? "In range"
                  : "Out of range"
            }
            sub={
              health.currentTick !== null && health.tickLower !== null
                ? `tick ${health.currentTick} [${health.tickLower}, ${health.tickUpper})`
                : "No position"
            }
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <StatusPill status={vaultPaused ? "critical" : "ok"} />
          <StatusPill status={airdropPaused ? "warn" : "ok"} />
          <StatusPill status={health.oraclePoolSeverity} />
          <StatusPill
            status={
              health.inRange === false ? "critical" : health.inRange === true ? "ok" : "unknown"
            }
          />
          {health.vaultLinkOk === false && <StatusPill status="critical" />}
        </div>

        {health.oraclePoolSeverity === "critical" && (
          <p className="mt-3 text-xs text-red-300/90 leading-relaxed">
            Oracle and pool prices diverge beyond the rebalance guard. Keeper{" "}
            <code className="text-red-200">rebalance</code> may revert with{" "}
            <code className="text-red-200">PRICE_DEVIATION</code> until prices align.
          </p>
        )}
        {health.inRange === false && (
          <p className="mt-3 text-xs text-amber-300/90 leading-relaxed">
            Current pool tick is outside the LP range — fee accrual may be minimal until keeper recenters.
          </p>
        )}
        {health.usingFallbackRef && (
          <p className="mt-3 text-xs text-amber-300/90 leading-relaxed">
            Pool price unavailable; adapter may be using stored ref price (fallback 42 USDC/HYPE in NAV if oracle is also zero).
          </p>
        )}
        {health.vaultLinkOk === false && (
          <p className="mt-3 text-xs text-red-300/90 leading-relaxed">
            Adapter <code className="text-red-200">vault</code> does not match HyperpoolVault — run{" "}
            <code className="text-red-200">adapter.setVault</code> via CLI.
          </p>
        )}
      </AdminCard>

      <AdminCard title="Price references" subtitle="USDC per HYPE (on-chain scale)">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatBox label="HyperCore oracle" value={formatRefPriceUsd(health.oraclePrice)} sub="vault.oraclePriceUsdc6PerHype18" />
          <StatBox label="Project X pool" value={formatRefPriceUsd(health.poolPrice)} sub="adapter.currentPoolPrice" />
          <StatBox label="Adapter ref" value={formatRefPriceUsd(health.refPrice)} sub="Last rebalance reference" />
        </div>
        {health.oracleRefDevBps !== null && (
          <p className="text-xs text-zinc-500 mt-3">Oracle ↔ ref deviation: {health.oracleRefDevBps.toFixed(2)} bps</p>
        )}
      </AdminCard>

      <AdminCard title="LP position" subtitle="Project X concentrated liquidity NFT">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            label="NFT tokenId"
            value={
              health.positionTokenId !== undefined && health.positionTokenId > 0n
                ? String(health.positionTokenId)
                : "None"
            }
            sub="adapter.positionTokenId"
          />
          <StatBox
            label="NPM liquidity"
            value={health.npmLiquidity !== undefined ? String(health.npmLiquidity) : "—"}
            sub="On-chain position liquidity"
          />
          <StatBox label="Tick lower" value={health.tickLower !== null ? String(health.tickLower) : "—"} />
          <StatBox label="Tick upper" value={health.tickUpper !== null ? String(health.tickUpper) : "—"} />
        </div>
      </AdminCard>

      <AdminCard title="Last Cashdrop" subtitle="From deployment JSON (updated by daily-rewards.mjs)">
        {last ? (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label="Amount"
                value={`${formatUnits(BigInt(last.amount), 6)} USDC`}
                sub={`${last.entries} recipient(s)`}
              />
              <StatBox
                label="Executed"
                value={new Date(last.executedAt).toLocaleString()}
                sub={
                  health.distributionExecuted === true
                    ? "On-chain: confirmed"
                    : health.distributionExecuted === false
                      ? "On-chain: not marked"
                      : "On-chain: —"
                }
              />
            </div>
            <p className="text-[11px] font-mono text-zinc-500 break-all">distributionId: {last.distributionId}</p>
            {last.txHash && (
              <p className="text-xs">
                Tx:{" "}
                {explorerTxUrl(chainId, last.txHash) ? (
                  <a
                    href={explorerTxUrl(chainId, last.txHash)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline font-mono"
                  >
                    {last.txHash.slice(0, 18)}…
                  </a>
                ) : (
                  <span className="font-mono text-zinc-400">{last.txHash.slice(0, 18)}…</span>
                )}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No Cashdrop recorded in deployment JSON yet.</p>
        )}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <StatBox label="Shareholders snapshotted" value={String(holders)} sub="vaultShareHolders" />
          <StatBox
            label="Pending payout list"
            value={`${entries} addr · ${formatUnits(entriesTotal, 6)} USDC`}
            sub="airdropEntries (off-chain)"
          />
        </div>
      </AdminCard>

      <AdminCard title="Vault configuration" subtitle="Owner-adjustable parameters (read-only)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            label="Rebalance deviation max"
            value={maxRebalanceDeviationBps !== undefined ? `${Number(maxRebalanceDeviationBps) / 100}%` : "—"}
            sub="setMaxRebalanceDeviationBps"
          />
          <StatBox
            label="HYPE → USDC on harvest"
            value={convertHypeFeesToUsdc === undefined ? "—" : convertHypeFeesToUsdc ? "Yes" : "No"}
            sub="convertHypeFeesToUsdc"
          />
          <StatBox
            label="Fee swap slippage"
            value={feeSwapSlippageBps !== undefined ? `${Number(feeSwapSlippageBps) / 100}%` : "—"}
            sub="feeSwapSlippageBps"
          />
          <StatBox
            label="Swap router"
            value={swapRouter && swapRouter !== "0x0000000000000000000000000000000000000000" ? "Set" : "Unset"}
            sub={swapRouter ? String(swapRouter).slice(0, 14) + "…" : "—"}
          />
        </div>
        <p className="text-[10px] text-zinc-600 mt-3">
          Cron keeper / daily-rewards status is off-chain — see{" "}
          <code className="text-zinc-400">docs/本番運用/local-mac-cron.md</code>.
        </p>
      </AdminCard>
    </div>
  );
}
