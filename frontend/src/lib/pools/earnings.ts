/**
 * Pool-scoped Cashdrop / earnings helpers for HYPE-quoted vaults.
 * NEVER reuse legacy deploymentPayouts.ts (hardcoded /1e6 USDC) for these pools.
 */
import type { PoolDeployment } from "@/lib/contracts";
import type { EarningsClaim } from "@/lib/earnings/history";

export function poolEarningsStorageKey(chainId: number, poolKey: string, address: string): string {
  return `hyperpool_pool_earnings_${chainId}_${poolKey}_${address.toLowerCase()}`;
}

function toClaim(
  executedAt: string,
  txHash: string,
  rawAmount: string,
  decimals: number
): EarningsClaim | null {
  let amount: number;
  try {
    amount = Number(BigInt(rawAmount)) / 10 ** decimals;
  } catch {
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const t = Date.parse(executedAt);
  if (!Number.isFinite(t)) return null;
  return { t, usdc: amount, txHash }; // field name is legacy; value is quote-token amount
}

/** Payout history from pools[].cashdrop, denominated in quote token (WHYPE). */
export function poolPayoutClaims(
  pool: PoolDeployment | null | undefined,
  address: string | undefined
): EarningsClaim[] {
  if (!pool || !address) return [];
  const cashdrop = pool.cashdrop;
  if (!cashdrop) return [];
  const addressLower = address.toLowerCase();
  const decimals = pool.quoteDecimals;
  const claims: EarningsClaim[] = [];

  for (const dist of cashdrop.cashdropDistributionHistory ?? []) {
    const entry = dist.entries?.find((e) => e.address.toLowerCase() === addressLower);
    if (!entry) continue;
    const claim = toClaim(dist.executedAt, dist.txHash, entry.amount, decimals);
    if (claim) claims.push(claim);
  }

  const last = cashdrop.lastCashdropDistribution;
  const lastEntry = cashdrop.airdropEntries?.find(
    (e) => e.address.toLowerCase() === addressLower
  );
  if (last && lastEntry && !claims.some((c) => c.txHash === last.txHash)) {
    const claim = toClaim(last.executedAt, last.txHash, lastEntry.amount, decimals);
    if (claim) claims.push(claim);
  }

  return claims.sort((a, b) => a.t - b.t);
}

export function formatQuoteAmount(amount: number, maxFrac = 6): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0.00";
  if (amount < 0.000001) return amount.toExponential(2);
  if (amount < 0.01) return amount.toFixed(Math.min(maxFrac, 8));
  if (amount < 1) return amount.toFixed(4);
  return amount.toFixed(Math.min(maxFrac, 4));
}
