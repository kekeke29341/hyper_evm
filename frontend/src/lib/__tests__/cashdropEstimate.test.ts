import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  buildLiveCashdropEstimate,
  distributionPoolUsdc6,
  estimateAtTime,
  estimateUserPayoutUsdc6,
  extrapolateWeightedHolders,
  impliedNetAprPercent,
  type CashdropEstimateSnapshot,
} from "@/lib/earnings/cashdropEstimate";

const ALICE = "0x1111111111111111111111111111111111111111" as Address;
const BOB = "0x2222222222222222222222222222222222222222" as Address;

function makeSnapshot(overrides: Partial<CashdropEstimateSnapshot> = {}): CashdropEstimateSnapshot {
  const syncedAtMs = 1_700_000_000_000;
  return {
    syncedAtMs,
    periodStartTimestamp: syncedAtMs / 1000 - 86_400,
    periodEndTimestamp: syncedAtMs / 1000,
    userShareSeconds: "86400000",
    totalShareSeconds: "172800000",
    userShares: "1000000",
    eligibleShareSupply: "2000000",
    pendingUsdc6: "0",
    uncollectedGrossUsdc6: "1000000",
    distributionPoolUsdc6: distributionPoolUsdc6(0n, 1_000_000n).toString(),
    poolAccrualUsdc6PerSecond: "0",
    estimatedUsdc6: "300000",
    userAddress: ALICE,
    weightedHolders: [
      { address: ALICE, shareSeconds: "86400000", currentShares: "1000000" },
      { address: BOB, shareSeconds: "86400000", currentShares: "1000000" },
    ],
    referrer: null,
    ...overrides,
  };
}

describe("distributionPoolUsdc6", () => {
  it("applies 60% user fee share to uncollected gross", () => {
    expect(distributionPoolUsdc6(100n, 1_000_000n)).toBe(600_100n);
  });
});

describe("estimateUserPayoutUsdc6", () => {
  it("matches buildCashdropEntries pro-rata split", () => {
    const pool = 1_000_000n;
    const amount = estimateUserPayoutUsdc6({
      weightedHolders: [
        { address: ALICE, shares: 60n },
        { address: BOB, shares: 40n },
      ],
      totalWeight: 100n,
      distributionPoolUsdc6: pool,
      userAddress: ALICE,
    });
    expect(amount).toBe(600_000n);
  });
});

describe("live extrapolation", () => {
  it("increases payout when share-seconds grow with constant pool", () => {
    const snapshot = makeSnapshot({
      distributionPoolUsdc6: "600000",
      poolAccrualUsdc6PerSecond: "0",
    });
    const now = estimateAtTime(snapshot, snapshot.syncedAtMs);
    const later = estimateAtTime(snapshot, snapshot.syncedAtMs + 60_000);
    expect(later).toBeGreaterThanOrEqual(now);
  });

  it("extrapolates holder weights linearly", () => {
    const snapshot = makeSnapshot();
    const holders = extrapolateWeightedHolders(snapshot.weightedHolders, snapshot.syncedAtMs, snapshot.syncedAtMs + 1000);
    const alice = holders.find((h) => h.address === ALICE)!;
    expect(alice.shares).toBe(86_400_000n + 1_000_000n);
  });

  it("buildLiveCashdropEstimate returns non-negative rate", () => {
    const snapshot = makeSnapshot();
    const live = buildLiveCashdropEstimate(snapshot, snapshot.syncedAtMs + 5000);
    expect(live.amountUsdc6).toBeGreaterThan(0n);
    expect(live.ratePerSecondUsdc6).toBeGreaterThanOrEqual(0);
  });
});

describe("impliedNetAprPercent", () => {
  it("annualizes live accrual rate against position value", () => {
    const rate = 1 / 86_400;
    expect(impliedNetAprPercent(rate, 1000)).toBeCloseTo(36.5, 0);
  });
});
