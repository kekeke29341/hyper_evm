import { PROJECT_X_POOL } from "@/lib/constants";

export type RangePreset = "asymmetric" | "custom";

export type PoolMetricsInput = {
  reserveHype: number;
  reserveUsdc: number;
  vaultShares: number;
  totalShares: number;
  poolAprPercent?: number;
  volume24hUsd?: number;
};

export function poolPriceUsdcPerHype(reserveHype: number, reserveUsdc: number): number {
  if (reserveHype <= 0) return 0;
  return reserveUsdc / reserveHype;
}

/** @deprecated use poolPriceUsdcPerHype */
export const poolPriceUsdcPerKhype = poolPriceUsdcPerHype;

export function poolTvlUsd(reserveHype: number, reserveUsdc: number): number {
  return reserveUsdc * 2;
}

export function positionTokenAmounts(
  vaultShares: number,
  totalShares: number,
  reserveHype: number,
  reserveUsdc: number
): { hype: number; usdc: number } {
  if (totalShares <= 0 || vaultShares <= 0) return { hype: 0, usdc: 0 };
  const share = vaultShares / totalShares;
  return {
    hype: reserveHype * share,
    usdc: reserveUsdc * share,
  };
}

/** Asymmetric range: +10% upper / −30% lower (keeper target) */
export function rangeBounds(
  price: number,
  upperPct = 10,
  lowerPct = 30
): { lower: number; upper: number; widthPct: number; upperPct: number; lowerPct: number } {
  return {
    lower: Math.round(price * (1 - lowerPct / 100)),
    upper: Math.round(price * (1 + upperPct / 100)),
    widthPct: upperPct + lowerPct,
    upperPct,
    lowerPct,
  };
}

export function isPriceInRange(price: number, lower: number, upper: number): boolean {
  return price >= lower && price <= upper;
}

/** Net user APY estimate = reference APY × user share (70%) */
export function estimatedNetApy(referenceAprPercent: number, userShareBps = 7000): number {
  return (referenceAprPercent * userShareBps) / 10_000;
}

export function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function positionValueUsd(
  vaultShares: number,
  totalShares: number,
  reserveHype: number,
  reserveUsdc: number
): number {
  const { hype, usdc } = positionTokenAmounts(vaultShares, totalShares, reserveHype, reserveUsdc);
  const price = poolPriceUsdcPerHype(reserveHype, reserveUsdc);
  return hype * price + usdc;
}

/** Concentrated LP: narrower band → higher fee capture; scaled by 70% user share */
export function estimatedApyFromRange(poolAprPercent: number, rangeWidthPct: number): number {
  const baselineWidth = PROJECT_X_POOL.upperRangePct + PROJECT_X_POOL.lowerRangePct;
  const concentration = baselineWidth / Math.max(rangeWidthPct, 1);
  return estimatedNetApy(poolAprPercent * concentration);
}

export function splitZapAmount(totalUsdc: number): { swap: number; keep: number } {
  const half = totalUsdc / 2;
  return { swap: half, keep: half };
}
