import { PROJECT_X_POOL } from "@/lib/constants";
import type { EarningsClaim } from "@/lib/earnings/history";
import type { RebalanceEvent } from "@/lib/liquidity/history";

/** Sample position for unauthenticated UI preview */
export const DEMO_POSITION = {
  valueUsd: 12_500,
  shares: "12500.000000",
  khype: 148.52,
  usdc: 6_250,
  lpBalance: 12_500,
  walletKhype: "24.50",
  walletUsdc: "842.00",
  rangeLower: 35_200,
  rangeUpper: 46_800,
  rangeWidthPct: 40,
} as const;

export const DEMO_CASHDROP = {
  availableUsdc: "24.50",
  pendingPoolUsdc: 128.4,
} as const;

export const DEMO_AFFILIATE = {
  referralCount: 12,
  commissionRate: "15%",
  commissionUsdc: "142.50",
} as const;

export const DEMO_AFFILIATE_LEADERBOARD = [
  { rank: 1, address: "0x1a2b…3c4d", referrals: 42 },
  { rank: 2, address: "0x4c5d…6e7f", referrals: 31 },
  { rank: 3, address: "0x8a9b…0c1d", referrals: 24 },
  { rank: 4, address: "0x2e3f…4a5b", referrals: 18 },
  { rank: 5, address: "0x6c7d…8e9f", referrals: 12 },
] as const;

export const DEMO_BRIDGE = {
  fromAmount: "1.0",
  toAmount: "3428.50",
  rate: "3428.5000",
  gasUsd: "4.20",
  durationMinutes: 8,
} as const;

const DEMO_HYPE_PRICE = 42_000;

export const DEMO_POOL = {
  reserveKhype: 340_000,
  reserveUsdc: 340_000 * DEMO_HYPE_PRICE,
  totalSupply: 1_000_000,
} as const;

export const DEMO_POSITION_START_OFFSET_DAYS = 95;

/** Deterministic daily Cashdrop claims for chart / metrics preview */
export function buildDemoEarningsClaims(now = Date.now()): EarningsClaim[] {
  const claims: EarningsClaim[] = [];
  for (let i = 119; i >= 0; i--) {
    if (i % 11 === 0) continue;
    const t = now - i * 86_400_000;
    const base = 14.2;
    const wave = Math.sin(i / 5) * 3;
    const mod = (i * 17) % 7;
    claims.push({ t, usdc: Math.round((base + wave + mod * 0.35) * 100) / 100 });
  }
  return claims;
}

export function demoPositionStart(now = Date.now()): number {
  return now - DEMO_POSITION_START_OFFSET_DAYS * 86_400_000;
}

export function buildDemoRebalanceEvents(now = Date.now()): RebalanceEvent[] {
  const price = DEMO_HYPE_PRICE;
  const lower = DEMO_POSITION.rangeLower;
  const upper = DEMO_POSITION.rangeUpper;
  return [
    {
      id: "demo-1",
      timestamp: now - 2 * 86_400_000,
      price,
      lower,
      upper,
      rangePct: DEMO_POSITION.rangeWidthPct,
      action: "zap",
      amountUsd: 5_000,
    },
    {
      id: "demo-2",
      timestamp: now - 18 * 86_400_000,
      price: price * 1.04,
      lower: Math.round(lower * 1.03),
      upper: Math.round(upper * 1.03),
      rangePct: DEMO_POSITION.rangeWidthPct,
      action: "add",
      amountUsd: 3_000,
    },
    {
      id: "demo-3",
      timestamp: now - 45 * 86_400_000,
      price: price * 0.97,
      lower: Math.round(lower * 0.96),
      upper: Math.round(upper * 0.96),
      rangePct: DEMO_POSITION.rangeWidthPct,
      action: "create",
      amountUsd: 12_500,
    },
  ];
}

/** Parse PROJECT_X_POOL.tvl like "$14.3M" to a numeric base for social proof animation */
export function projectXTvlBase(): number {
  const raw = PROJECT_X_POOL.tvl.replace(/[$,]/g, "");
  if (raw.endsWith("M")) return parseFloat(raw) * 1_000_000;
  if (raw.endsWith("K")) return parseFloat(raw) * 1_000;
  return parseFloat(raw) || 14_300_000;
}

export function projectXVolumeBase(): number {
  const raw = PROJECT_X_POOL.volume24h.replace(/[$,]/g, "");
  if (raw.endsWith("M")) return parseFloat(raw) * 1_000_000;
  if (raw.endsWith("K")) return parseFloat(raw) * 1_000;
  return parseFloat(raw) || 151_000_000;
}
