import { describe, expect, it } from "vitest";
import {
  buildDemoEarningsClaims,
  buildDemoRebalanceEvents,
  DEMO_POSITION,
  projectXTvlBase,
} from "@/lib/demo/data";
import { computeEarningsMetrics } from "@/lib/earnings/history";

describe("demo data", () => {
  it("builds deterministic earnings claims", () => {
    const fixedNow = new Date("2026-06-15T12:00:00Z").getTime();
    const a = buildDemoEarningsClaims(fixedNow);
    const b = buildDemoEarningsClaims(fixedNow);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(80);
    expect(a.every((c) => c.usdc > 0)).toBe(true);
  });

  it("produces plausible dashboard metrics", () => {
    const now = Date.now();
    const claims = buildDemoEarningsClaims(now);
    const metrics = computeEarningsMetrics(
      claims,
      DEMO_POSITION.valueUsd,
      now - 95 * 86_400_000,
      75
    );
    expect(metrics.totalEarned).toBeGreaterThan(500);
    expect(metrics.operatingDays).toBeGreaterThanOrEqual(95);
    expect(metrics.estimatedApr).not.toBeNull();
  });

  it("includes rebalance history samples", () => {
    const events = buildDemoRebalanceEvents();
    expect(events).toHaveLength(3);
    expect(events[0].action).toBe("zap");
  });

  it("parses Project X TVL base", () => {
    expect(projectXTvlBase()).toBeGreaterThan(10_000_000);
  });
});
