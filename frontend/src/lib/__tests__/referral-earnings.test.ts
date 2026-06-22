import { describe, it, expect } from "vitest";
import type { Address } from "viem";
import {
  cashdropPoolFromEntries,
  computeReferrerCommission,
  sumEligibleShares,
} from "@/lib/referral/earnings";

const ALICE = "0x1111111111111111111111111111111111111111" as Address;
const BOB = "0x2222222222222222222222222222222222222222" as Address;

describe("referral earnings", () => {
  it("sums eligible shares excluding dead address", () => {
    const total = sumEligibleShares([
      { address: ALICE, shares: "60" },
      { address: "0x000000000000000000000000000000000000dEaD", shares: "999" },
      { address: BOB, shares: "40" },
    ]);
    expect(total).toBe(100n);
  });

  it("computes referrer commission from deployment snapshot", () => {
    const referrers = new Map<string, Address>();
    referrers.set(BOB.toLowerCase(), ALICE);

    const deployment = {
      chainId: 998,
      airdrop: ALICE,
      tokenKHYPE: ALICE,
      tokenUSDC: ALICE,
      vaultShareHolders: [{ address: BOB, shares: "100" }],
      airdropEntries: [
        { address: BOB, amount: "8800" },
        { address: ALICE, amount: "1200" },
      ],
    };

    expect(cashdropPoolFromEntries(deployment.airdropEntries)).toBe(10_000n);
    expect(
      computeReferrerCommission({ address: ALICE, deployment, referrers })
    ).toBe(1200n);
    expect(
      computeReferrerCommission({ address: BOB, deployment, referrers })
    ).toBe(0n);
  });
});
