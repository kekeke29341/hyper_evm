import { describe, expect, it } from "vitest";
import {
  estimatedApyFromRange,
  formatHypeSpotPrice,
  formatRangeBound,
  poolPriceUsdcPerKhype,
  positionValueUsd,
  rangeBounds,
  splitZapAmount,
} from "@/lib/liquidity/metrics";

describe("liquidity metrics", () => {
  it("calculates pool price", () => {
    expect(poolPriceUsdcPerKhype(100, 2000)).toBe(20);
  });

  it("computes asymmetric range bounds (+10% / −30%)", () => {
    const b = rangeBounds(2000, 10, 30);
    expect(b.lower).toBe(1400);
    expect(b.upper).toBe(2200);
    expect(b.widthPct).toBe(40);
  });

  it("splits zap amount evenly", () => {
    expect(splitZapAmount(2000)).toEqual({ swap: 1000, keep: 1000 });
  });

  it("estimates higher APY for narrower range band", () => {
    const wide = estimatedApyFromRange(100, 40);
    const narrow = estimatedApyFromRange(100, 12);
    expect(narrow).toBeGreaterThan(wide);
  });

  it("values LP position from reserves", () => {
    const v = positionValueUsd(10, 100, 50, 1000);
    expect(v).toBeCloseTo(5 * 20 + 100, 2);
  });

  it("formatHypeSpotPrice avoids zero while loading", () => {
    expect(formatHypeSpotPrice(0, true, "…")).toBe("…");
    expect(formatHypeSpotPrice(61.4, false)).toBe("61");
    expect(formatHypeSpotPrice(0, false)).toBe("—");
  });

  it("formatRangeBound hides bounds until price is ready", () => {
    expect(formatRangeBound(43, 0, false)).toBe("—");
    expect(formatRangeBound(43, 61, true)).toBe("—");
    expect(formatRangeBound(43, 61, false)).toBe("43");
  });
});
