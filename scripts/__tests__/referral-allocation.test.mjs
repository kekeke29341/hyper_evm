import test from "node:test";
import assert from "node:assert/strict";
import { buildCashdropEntries } from "../lib/referral-allocation.mjs";

const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";

test("pro-rata cashdrop split", () => {
  const entries = buildCashdropEntries({
    holders: [
      { address: ALICE, shares: 60n },
      { address: BOB, shares: 40n },
    ],
    pending: 10_000n,
    totalShares: 100n,
  });
  const sum = entries.reduce((s, e) => s + e.amount, 0n);
  assert.equal(sum, 10_000n);
  assert.equal(entries.find((e) => e.address === ALICE)?.amount, 6000n);
  assert.equal(entries.find((e) => e.address === BOB)?.amount, 4000n);
});

test("referral boost normalizes to pending pool", () => {
  const referrers = new Map();
  referrers.set(BOB.toLowerCase(), ALICE);

  const entries = buildCashdropEntries({
    holders: [{ address: BOB, shares: 100n }],
    pending: 10_000n,
    totalShares: 100n,
    referrers,
  });

  const sum = entries.reduce((s, e) => s + e.amount, 0n);
  assert.equal(sum, 10_000n);
  assert.equal(entries.find((e) => e.address === BOB)?.amount, 8800n);
  assert.equal(entries.find((e) => e.address === ALICE)?.amount, 1200n);
});
