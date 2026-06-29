import { describe, it, expect } from "vitest";
import {
  deviationSeverity,
  isTickInRange,
  priceDeviationBps,
} from "@/lib/admin/health";

describe("priceDeviationBps", () => {
  it("returns null when either price is zero", () => {
    expect(priceDeviationBps(0n, 100n)).toBeNull();
    expect(priceDeviationBps(100n, 0n)).toBeNull();
  });

  it("computes basis-point deviation", () => {
    const base = 100_000_000_000_000_000_000n; // 100 * 1e18
    const fivePct = 105_000_000_000_000_000_000n;
    expect(priceDeviationBps(base, fivePct)).toBe(500);
  });
});

describe("isTickInRange", () => {
  it("is inclusive on lower, exclusive on upper (Uniswap V3)", () => {
    expect(isTickInRange(0, -10, 10)).toBe(true);
    expect(isTickInRange(-10, -10, 10)).toBe(true);
    expect(isTickInRange(10, -10, 10)).toBe(false);
  });
});

describe("deviationSeverity", () => {
  it("flags critical at or above max bps", () => {
    expect(deviationSeverity(500, 500)).toBe("critical");
    expect(deviationSeverity(499, 500)).toBe("warn");
    expect(deviationSeverity(100, 500)).toBe("ok");
  });
});
