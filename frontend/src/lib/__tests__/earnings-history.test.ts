import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  appendEarningsClaim,
  buildEarningsChartData,
  computeEarningsMetrics,
  earningsStorageKey,
  mergeEarningsClaims,
} from "@/lib/earnings/history";

describe("earnings history", () => {
  beforeEach(() => {
    const backing: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem(key: string) {
        return backing[key] ?? null;
      },
      setItem(key: string, value: string) {
        backing[key] = value;
      },
    });
  });

  it("builds storage key from chain and address", () => {
    expect(earningsStorageKey(31337, "0xAbC")).toBe("hyperpool_earnings_31337_0xabc");
  });

  it("accumulates same-day claims", () => {
    const key = "test_earnings";
    const now = Date.now();
    appendEarningsClaim(key, 10, now);
    appendEarningsClaim(key, 5, now + 1000);
    const chart = buildEarningsChartData(
      [{ t: now, usdc: 15 }],
      "cumulative",
      "en",
      7
    );
    expect(chart.some((p) => p.value >= 15)).toBe(true);
  });

  it("computes dashboard metrics", () => {
    const now = Date.now();
    const positionStart = now - 5 * 86400000;
    const claims = [
      { t: now - 2 * 86400000, usdc: 10 },
      { t: now - 86400000, usdc: 5 },
      { t: now, usdc: 3 },
    ];
    const metrics = computeEarningsMetrics(claims, 1000, positionStart, 75, now);
    expect(metrics.totalEarned).toBe(18);
    expect(metrics.earned24h).toBe(3);
    expect(metrics.estimatedApr).not.toBeNull();
    expect(metrics.operatingDays).toBeGreaterThanOrEqual(5);
    expect(metrics.operatingDays).toBeLessThanOrEqual(6);
  });

  it("returns null estimatedApr without claim history", () => {
    const metrics = computeEarningsMetrics([], 1000, Date.now() - 86400000, 75);
    expect(metrics.estimatedApr).toBeNull();
    expect(metrics.earned24h).toBe(0);
  });

  it("merges on-chain and local without duplicates", () => {
    const now = Date.now();
    const onChain = [{ t: now, usdc: 10, txHash: "0xabc" }];
    const local = [
      { t: now, usdc: 10, txHash: "0xabc" },
      { t: now + 1000, usdc: 2 },
    ];
    const merged = mergeEarningsClaims(onChain, local);
    expect(merged).toHaveLength(2);
    expect(merged.reduce((s, c) => s + c.usdc, 0)).toBe(12);
  });
});
