import { describe, expect, it } from "vitest";
import {
  computeShareSecondsFromTransfers,
  sortVaultTransfers,
  weightedShareHolders,
} from "@/lib/referral/timeWeighted";

const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";

describe("computeShareSecondsFromTransfers", () => {
  it("weights by holding duration — late depositor earns less", () => {
    const day = 86_400;
    const transfers = sortVaultTransfers([
      {
        from: ZERO,
        to: ALICE,
        value: 1000n,
        blockNumber: 1n,
        logIndex: 0,
        timestamp: 60, // 7:01 yesterday
      },
      {
        from: ZERO,
        to: BOB,
        value: 1000n,
        blockNumber: 2n,
        logIndex: 0,
        timestamp: day - 60, // 6:59 today
      },
    ]);

    const { weighted } = computeShareSecondsFromTransfers({
      periodStartTimestamp: 0,
      periodEndTimestamp: day,
      initialBalances: {},
      transfers,
    });

    const alice = weighted.get(ALICE.toLowerCase())!;
    const bob = weighted.get(BOB.toLowerCase())!;
    expect(alice).toBe(1000n * BigInt(day - 60));
    expect(bob).toBe(1000n * 60n);
    expect(alice).toBeGreaterThan(bob * 100n);
  });

  it("accrues constant balance across the full period", () => {
    const { weighted } = computeShareSecondsFromTransfers({
      periodStartTimestamp: 1000,
      periodEndTimestamp: 2000,
      initialBalances: { [ALICE]: 500n },
      transfers: [],
    });
    expect(weighted.get(ALICE.toLowerCase())).toBe(500n * 1000n);
  });

  it("stops accruing after withdraw", () => {
    const transfers = sortVaultTransfers([
      {
        from: ALICE,
        to: BOB,
        value: 500n,
        blockNumber: 5n,
        logIndex: 0,
        timestamp: 1500,
      },
    ]);

    const { weighted } = computeShareSecondsFromTransfers({
      periodStartTimestamp: 1000,
      periodEndTimestamp: 2000,
      initialBalances: { [ALICE]: 500n },
      transfers,
    });

    expect(weighted.get(ALICE.toLowerCase())).toBe(500n * 500n);
    expect(weighted.get(BOB.toLowerCase())).toBe(500n * 500n);
  });

  it("exports holders sorted by address", () => {
    const weighted = new Map<string, bigint>([
      [BOB.toLowerCase(), 100n],
      [ALICE.toLowerCase(), 200n],
    ]);
    const holders = weightedShareHolders(weighted);
    expect(holders[0].address.toLowerCase()).toBe(ALICE.toLowerCase());
    expect(holders[1].address.toLowerCase()).toBe(BOB.toLowerCase());
  });
});
