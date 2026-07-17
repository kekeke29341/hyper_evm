import type { Address } from "viem";
import { getAddress } from "viem";
import { buildCashdropEntries, type ReferrerLookup, type ShareHolder } from "@/lib/referral/allocation";
import { computeShareSecondsFromTransfers, type VaultTransfer } from "@/lib/referral/timeWeighted";

export const SECONDS_PER_YEAR = 365 * 24 * 3600;

/** Must match ProjectXConstants.USER_FEE_BPS */
export const USER_FEE_BPS = 6000n;
export const BPS = 10_000n;

export type WeightedHolderState = {
  address: Address;
  shareSeconds: string;
  currentShares: string;
};

export type CashdropEstimateSnapshot = {
  syncedAtMs: number;
  periodStartTimestamp: number;
  periodEndTimestamp: number;
  userShareSeconds: string;
  totalShareSeconds: string;
  userShares: string;
  eligibleShareSupply: string;
  pendingUsdc6: string;
  uncollectedGrossUsdc6: string;
  distributionPoolUsdc6: string;
  poolAccrualUsdc6PerSecond: string;
  estimatedUsdc6: string;
  userAddress: Address;
  weightedHolders: WeightedHolderState[];
  referrer: Address | null;
};

export function userFeePortionUsdc6(grossUsdc6: bigint, userFeeBps = USER_FEE_BPS): bigint {
  return (grossUsdc6 * userFeeBps) / BPS;
}

export function distributionPoolUsdc6(
  pendingUsdc6: bigint,
  uncollectedGrossUsdc6: bigint,
  userFeeBps = USER_FEE_BPS
): bigint {
  return pendingUsdc6 + userFeePortionUsdc6(uncollectedGrossUsdc6, userFeeBps);
}

export function extrapolateWeightedHolders(
  holders: WeightedHolderState[],
  syncedAtMs: number,
  nowMs: number
): ShareHolder[] {
  const deltaSec = BigInt(Math.max(0, Math.floor((nowMs - syncedAtMs) / 1000)));
  return holders.map((h) => ({
    address: getAddress(h.address),
    shares: BigInt(h.shareSeconds) + BigInt(h.currentShares) * deltaSec,
  }));
}

export function extrapolateDistributionPool(
  poolUsdc6: bigint,
  poolAccrualUsdc6PerSecond: number,
  syncedAtMs: number,
  nowMs: number
): bigint {
  const deltaSec = Math.max(0, (nowMs - syncedAtMs) / 1000);
  const accrual = BigInt(Math.floor(poolAccrualUsdc6PerSecond * deltaSec));
  return poolUsdc6 + accrual;
}

export function estimateUserPayoutUsdc6(params: {
  weightedHolders: ShareHolder[];
  totalWeight: bigint;
  distributionPoolUsdc6: bigint;
  userAddress: Address;
  referrers?: ReferrerLookup;
}): bigint {
  const { weightedHolders, totalWeight, distributionPoolUsdc6, userAddress, referrers } = params;
  if (totalWeight === 0n || distributionPoolUsdc6 === 0n) return 0n;

  const entries = buildCashdropEntries({
    holders: weightedHolders,
    pending: distributionPoolUsdc6,
    totalShares: totalWeight,
    referrers,
  });

  const row = entries.find((e) => e.address.toLowerCase() === userAddress.toLowerCase());
  return row?.amount ?? 0n;
}

export function estimateAtTime(
  snapshot: CashdropEstimateSnapshot,
  nowMs: number,
  referrers?: ReferrerLookup
): bigint {
  const weightedHolders = extrapolateWeightedHolders(snapshot.weightedHolders, snapshot.syncedAtMs, nowMs);
  const totalWeight = weightedHolders.reduce((sum, h) => sum + h.shares, 0n);
  const pool = extrapolateDistributionPool(
    BigInt(snapshot.distributionPoolUsdc6),
    Number(snapshot.poolAccrualUsdc6PerSecond),
    snapshot.syncedAtMs,
    nowMs
  );

  return estimateUserPayoutUsdc6({
    weightedHolders,
    totalWeight,
    distributionPoolUsdc6: pool,
    userAddress: snapshot.userAddress,
    referrers,
  });
}

export function buildLiveCashdropEstimate(
  snapshot: CashdropEstimateSnapshot,
  nowMs: number,
  referrers?: ReferrerLookup
): { amountUsdc6: bigint; ratePerSecondUsdc6: number; ratePerMinuteUsdc6: number } {
  const amountUsdc6 = estimateAtTime(snapshot, nowMs, referrers);
  const nextUsdc6 = estimateAtTime(snapshot, nowMs + 1000, referrers);
  const ratePerSecondUsdc6 = Number(nextUsdc6 - amountUsdc6) / 1e6;
  return { amountUsdc6, ratePerSecondUsdc6, ratePerMinuteUsdc6: ratePerSecondUsdc6 * 60 };
}

export function transfersFromLogs(
  logs: {
    args: { from: Address; to: Address; value: bigint };
    blockNumber: bigint;
    logIndex: number;
  }[],
  blockTimestamps: Map<string, number>
): VaultTransfer[] {
  return logs.map((log) => ({
    from: log.args.from,
    to: log.args.to,
    value: log.args.value,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    timestamp: blockTimestamps.get(log.blockNumber.toString()) ?? 0,
  }));
}

export function weightedHoldersFromTransfers(params: {
  periodStartTimestamp: number;
  periodEndTimestamp: number;
  initialBalances: Record<string, string>;
  transfers: VaultTransfer[];
}): { holders: ShareHolder[]; totalWeight: bigint } {
  const { weighted } = computeShareSecondsFromTransfers(params);
  const holders: ShareHolder[] = [...weighted.entries()]
    .filter(([, w]) => w > 0n)
    .map(([address, shares]) => ({
      address: getAddress(address),
      shares,
    }))
    .sort((a, b) => a.address.localeCompare(b.address));

  const totalWeight = holders.reduce((sum, h) => sum + h.shares, 0n);
  return { holders, totalWeight };
}

export function formatUsdc6(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0");
  if (whole >= 100n) return `${whole}.${fracStr.slice(0, 2)}`;
  if (whole >= 1n) return `${whole}.${fracStr.slice(0, 4)}`;
  return `${whole}.${fracStr}`;
}

export function formatAccruingRate(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0.000000";
  if (amount >= 0.01) return amount.toFixed(6);
  return amount.toFixed(8);
}

/** Annualized net APR from the live Cashdrop accrual rate and position size. */
export function impliedNetAprPercent(ratePerSecondUsdc: number, positionValueUsd: number): number | null {
  if (!Number.isFinite(ratePerSecondUsdc) || ratePerSecondUsdc <= 0) return null;
  if (!Number.isFinite(positionValueUsd) || positionValueUsd <= 0) return null;
  return ((ratePerSecondUsdc * SECONDS_PER_YEAR) / positionValueUsd) * 100;
}

export function projectedDailyUsdc(ratePerSecondUsdc: number): number {
  if (!Number.isFinite(ratePerSecondUsdc) || ratePerSecondUsdc <= 0) return 0;
  return ratePerSecondUsdc * 86_400;
}
