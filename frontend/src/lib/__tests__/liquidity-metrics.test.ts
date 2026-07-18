import { describe, expect, it } from "vitest";
import {
  estimatedNetApy,
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

  it("computes asymmetric range bounds (+10% / −17%)", () => {
    const b = rangeBounds(2000, 10, 17);
    expect(b.lower).toBe(1660);
    expect(b.upper).toBe(2200);
    expect(b.widthPct).toBe(27);
  });

  it("splits zap amount evenly", () => {
    expect(splitZapAmount(2000)).toEqual({ swap: 1000, keep: 1000 });
  });

  it("net APY is pool APY scaled by the 60% user share", () => {
    expect(estimatedNetApy(100)).toBe(60);
    expect(estimatedNetApy(75, 6000)).toBe(45);
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
