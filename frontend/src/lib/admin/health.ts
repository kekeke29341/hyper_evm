import { refPriceToUsdPerHype } from "@/lib/liquidity/price";

/** Absolute deviation between two on-chain refPrice values, in basis points. */
export function priceDeviationBps(a: bigint, b: bigint): number | null {
  if (a <= 0n || b <= 0n) return null;
  const diff = a > b ? a - b : b - a;
  return Number((diff * 10_000n) / a);
}

export function formatRefPriceUsd(refPrice: bigint | undefined): string {
  if (refPrice === undefined || refPrice <= 0n) return "—";
  const usd = refPriceToUsdPerHype(refPrice);
  return usd > 0 ? usd.toFixed(2) : "—";
}

export function isTickInRange(currentTick: number, tickLower: number, tickUpper: number): boolean {
  return currentTick >= tickLower && currentTick < tickUpper;
}

export function deviationSeverity(
  deviationBps: number | null,
  maxBps: number
): "ok" | "warn" | "critical" | "unknown" {
  if (deviationBps === null) return "unknown";
  if (deviationBps >= maxBps) return "critical";
  if (deviationBps >= maxBps * 0.8) return "warn";
  return "ok";
}
