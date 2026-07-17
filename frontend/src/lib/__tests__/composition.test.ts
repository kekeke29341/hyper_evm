import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
  compositionFromRefPrice,
  mapAdapterTokenAmounts,
  vaultCompositionFromParts,
} from "@/lib/liquidity/composition";

const WHYPE = "0x5555555555555555555555555555555555555555" as Address;
const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f" as Address;

describe("mapAdapterTokenAmounts", () => {
  it("maps token0 WHYPE to hype side", () => {
    const mapped = mapAdapterTokenAmounts(2n * 10n ** 18n, 100n * 10n ** 6n, WHYPE, WHYPE);
    expect(mapped.hype).toBe(2n * 10n ** 18n);
    expect(mapped.usdc).toBe(100n * 10n ** 6n);
  });

  it("maps token0 USDC to usdc side", () => {
    const mapped = mapAdapterTokenAmounts(100n * 10n ** 6n, 2n * 10n ** 18n, USDC, WHYPE);
    expect(mapped.usdc).toBe(100n * 10n ** 6n);
    expect(mapped.hype).toBe(2n * 10n ** 18n);
  });
});

describe("vaultCompositionFromParts", () => {
  it("weights idle HYPE into allocation", () => {
    const comp = vaultCompositionFromParts({
      lpHype: 1n * 10n ** 18n,
      lpUsdc: 3000n * 10n ** 6n,
      idleHype: 1n * 10n ** 18n,
      idleUsdc: 0n,
      priceUsdPerHype: 42,
    });
    expect(comp.reserveHype).toBeCloseTo(2, 5);
    expect(comp.reserveUsdc).toBeCloseTo(3000, 5);
    expect(comp.hypePct).toBeGreaterThan(2);
    expect(comp.usdcPct).toBeLessThan(98);
    expect(comp.hypePct + comp.usdcPct).toBeCloseTo(100, 5);
  });

  it("uses ref price scale from adapter", () => {
    const comp = compositionFromRefPrice(
      1n * 10n ** 18n,
      42n * 10n ** 6n,
      0n,
      0n,
      42n * 10n ** 6n * 10n ** 12n
    );
    expect(comp.hypePct).toBeCloseTo(50, 1);
    expect(comp.usdcPct).toBeCloseTo(50, 1);
  });
});
