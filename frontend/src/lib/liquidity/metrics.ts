export type RangePreset = 3 | 6 | 10 | "custom";

export type PoolMetricsInput = {
  reserveKhype: number;
  reserveUsdc: number;
  lpBalance: number;
  totalSupply: number;
  poolAprPercent?: number;
  volume24hUsd?: number;
};

export function poolPriceUsdcPerKhype(reserveKhype: number, reserveUsdc: number): number {
  if (reserveKhype <= 0) return 0;
  return reserveUsdc / reserveKhype;
}

export function poolTvlUsd(reserveKhype: number, reserveUsdc: number): number {
  return reserveUsdc * 2;
}

export function positionTokenAmounts(
  lpBalance: number,
  totalSupply: number,
  reserveKhype: number,
  reserveUsdc: number
): { khype: number; usdc: number } {
  if (totalSupply <= 0 || lpBalance <= 0) return { khype: 0, usdc: 0 };
  const share = lpBalance / totalSupply;
  return {
    khype: reserveKhype * share,
    usdc: reserveUsdc * share,
  };
}

export function positionValueUsd(
  lpBalance: number,
  totalSupply: number,
  reserveKhype: number,
  reserveUsdc: number,
  khypeUsd = 0.42
): number {
  const { khype, usdc } = positionTokenAmounts(lpBalance, totalSupply, reserveKhype, reserveUsdc);
  return khype * khypeUsd + usdc;
}

export function rangeBounds(price: number, preset: RangePreset, customPct = 3): { lower: number; upper: number; widthPct: number } {
  const pct = preset === "custom" ? customPct : preset;
  const factor = pct / 100;
  return {
    lower: Math.round(price * (1 - factor)),
    upper: Math.round(price * (1 + factor)),
    widthPct: pct * 2,
  };
}

export function isPriceInRange(price: number, lower: number, upper: number): boolean {
  return price >= lower && price <= upper;
}

export function estimatedApyFromRange(poolAprPercent: number, rangeWidthPct: number): number {
  if (rangeWidthPct <= 0) return poolAprPercent;
  // Narrower monitoring band → higher capital efficiency estimate (illustrative for V2 full-range LP).
  const concentration = Math.min(3, 100 / rangeWidthPct);
  return poolAprPercent * concentration;
}

export function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function splitZapAmount(amount: number): { swap: number; keep: number } {
  const swap = amount / 2;
  return { swap, keep: amount - swap };
}
