import { formatUnits } from "viem";
import type { PoolDeployment } from "@/lib/contracts";

/** priceDiv = 10^(baseDec + 18 − quoteDec) */
export function priceDivFor(pool: PoolDeployment): bigint {
  const exp = BigInt(pool.baseDecimals) + 18n - BigInt(pool.quoteDecimals);
  return 10n ** exp;
}

export function formatTokenAmount(raw: bigint, decimals: number, maxFrac = 4): string {
  const s = formatUnits(raw, decimals);
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

/** Adapter ref price: quote-per-base × 1e18 */
export function formatQuotePerBase(priceRaw: bigint, pool: PoolDeployment): string {
  if (priceRaw <= 0n) return "—";
  const human = Number(priceRaw) / 1e18;
  const q = pool.quoteSymbol === "WHYPE" ? "HYPE" : pool.quoteSymbol ?? "quote";
  const b = pool.baseSymbol ?? "base";
  if (human >= 1000) return `${human.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${q}/${b}`;
  return `${human.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${q}/${b}`;
}

export function poolRangeLabel(pool: PoolDeployment): string {
  const up = pool.upperRangeBps ?? 500;
  const lo = pool.lowerRangeBps ?? 500;
  return `±${Math.round((up + lo) / 2 / 100)}%`;
}

export function displayQuoteSymbol(pool: PoolDeployment): string {
  return pool.quoteSymbol === "WHYPE" ? "HYPE" : pool.quoteSymbol ?? "quote";
}

export function displayBaseSymbol(pool: PoolDeployment): string {
  return pool.baseSymbol ?? "base";
}
