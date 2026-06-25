import { describe, it, expect } from "vitest";
import { logScanPlan, logScanRanges, ON_CHAIN_EARNINGS_CHAIN_IDS } from "@/lib/earnings/onChain";

describe("on-chain earnings scan", () => {
  it("enables sync on HyperEVM networks and local", () => {
    expect(ON_CHAIN_EARNINGS_CHAIN_IDS.has(998)).toBe(true);
    expect(ON_CHAIN_EARNINGS_CHAIN_IDS.has(999)).toBe(true);
    expect(ON_CHAIN_EARNINGS_CHAIN_IDS.has(31337)).toBe(true);
  });

  it("uses small chunks on HyperEVM networks", () => {
    const plan = logScanPlan(998);
    expect(plan.chunk).toBe(1_000n);
    expect(plan.maxLookback).toBeGreaterThan(3_000n);

    const mainnetPlan = logScanPlan(999);
    expect(mainnetPlan.chunk).toBe(1_000n);
  });

  it("builds contiguous paginated ranges", () => {
    const plan = { chunk: 1_000n, maxLookback: 2_500n, fastWindows: [] as bigint[] };
    const ranges = logScanRanges(10_000n, plan);
    expect(ranges[0]).toEqual({ fromBlock: 9_001n, toBlock: 10_000n });
    expect(ranges.at(-1)?.fromBlock).toBeGreaterThanOrEqual(7_500n);
    expect(ranges.length).toBeGreaterThan(1);
  });
});
