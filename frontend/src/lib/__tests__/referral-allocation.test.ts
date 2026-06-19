import { describe, it, expect } from "vitest";
import type { Address } from "viem";
import { buildCashdropEntries, normalizeCashdropEntries } from "@/lib/referral/allocation";

const ALICE = "0x1111111111111111111111111111111111111111" as Address;
const BOB = "0x2222222222222222222222222222222222222222" as Address;
const CAROL = "0x3333333333333333333333333333333333333333" as Address;

describe("cashdrop referral allocation", () => {
  it("splits pro-rata without referrers", () => {
    const entries = buildCashdropEntries({
      holders: [
        { address: ALICE, shares: 60n },
        { address: BOB, shares: 40n },
      ],
      pending: 10_000n,
      totalShares: 100n,
    });
    const sum = entries.reduce((s, e) => s + e.amount, 0n);
    expect(sum).toBe(10_000n);
    expect(entries.find((e) => e.address === ALICE)?.amount).toBe(6000n);
    expect(entries.find((e) => e.address === BOB)?.amount).toBe(4000n);
  });

  it("applies referee boost and referrer commission then normalizes", () => {
    const referrers = new Map<string, Address>();
    referrers.set(BOB.toLowerCase(), ALICE);

    const entries = buildCashdropEntries({
      holders: [{ address: BOB, shares: 100n }],
      pending: 10_000n,
      totalShares: 100n,
      referrers,
    });

    const sum = entries.reduce((s, e) => s + e.amount, 0n);
    expect(sum).toBe(10_000n);

    const bob = entries.find((e) => e.address === BOB)!;
    const alice = entries.find((e) => e.address === ALICE)!;
    // Raw: Bob 11000, Alice 1500 → scaled to 10000
    expect(bob.amount).toBe(8800n);
    expect(alice.amount).toBe(1200n);
  });

  it("merges referrer commission when referrer is also a holder", () => {
    const referrers = new Map<string, Address>();
    referrers.set(BOB.toLowerCase(), ALICE);

    const entries = buildCashdropEntries({
      holders: [
        { address: ALICE, shares: 50n },
        { address: BOB, shares: 50n },
      ],
      pending: 10_000n,
      totalShares: 100n,
      referrers,
    });

    const sum = entries.reduce((s, e) => s + e.amount, 0n);
    expect(sum).toBe(10_000n);
    expect(entries.find((e) => e.address === CAROL)).toBeUndefined();
    expect(entries.find((e) => e.address === ALICE)?.amount).toBeGreaterThan(5000n);
  });

  it("returns empty for zero pending", () => {
    expect(buildCashdropEntries({
      holders: [{ address: ALICE, shares: 100n }],
      pending: 0n,
      totalShares: 100n,
    })).toEqual([]);
  });

  it("throws when totalShares is zero", () => {
    expect(() =>
      buildCashdropEntries({
        holders: [{ address: ALICE, shares: 0n }],
        pending: 1000n,
        totalShares: 0n,
      })
    ).toThrow("totalShares is zero");
  });

  it("skips holders with dust shares", () => {
    const entries = buildCashdropEntries({
      holders: [
        { address: ALICE, shares: 1n },
        { address: BOB, shares: 999n },
      ],
      pending: 500n,
      totalShares: 1000n,
    });
    expect(entries.find((e) => e.address === ALICE)).toBeUndefined();
    expect(entries.find((e) => e.address === BOB)?.amount).toBe(500n);
  });

  it("normalizeCashdropEntries fixes rounding dust", () => {
    const raw = new Map<string, bigint>([
      [ALICE.toLowerCase(), 3333n],
      [BOB.toLowerCase(), 3333n],
      [CAROL.toLowerCase(), 3333n],
    ]);
    const entries = normalizeCashdropEntries(raw, 10_000n);
    expect(entries.reduce((s, e) => s + e.amount, 0n)).toBe(10_000n);
  });
});
