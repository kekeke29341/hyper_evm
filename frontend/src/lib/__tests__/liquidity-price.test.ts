import { describe, it, expect } from "vitest";
import { lpReservesFromTvl, refPriceToUsdPerHype } from "@/lib/liquidity/price";

describe("refPriceToUsdPerHype", () => {
  it("converts on-chain refPrice to human USD/HYPE", () => {
    expect(refPriceToUsdPerHype(62_027_054_519_091_669_006n)).toBeCloseTo(62.03, 1);
    expect(refPriceToUsdPerHype(42_000_000_000_000_000_000n)).toBe(42);
  });

  it("returns 0 for zero refPrice", () => {
    expect(refPriceToUsdPerHype(0n)).toBe(0);
  });
});

describe("lpReservesFromTvl", () => {
  it("splits TVL 50/50 by spot price", () => {
    const { reserveHype, reserveUsdc } = lpReservesFromTvl(1000, 50);
    expect(reserveUsdc).toBe(500);
    expect(reserveHype).toBe(10);
  });
});
