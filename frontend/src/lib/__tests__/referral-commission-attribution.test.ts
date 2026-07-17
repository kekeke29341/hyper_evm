import { describe, it, expect } from "vitest";
import type { Address } from "viem";
import { computeCommissionFromReferee } from "@/lib/referral/commissionAttribution";

const ALICE = "0x1111111111111111111111111111111111111111" as Address;
const BOB = "0x2222222222222222222222222222222222222222" as Address;

describe("computeCommissionFromReferee", () => {
  it("attributes referrer commission to the bound referee", () => {
    const referrers = new Map<string, Address>();
    referrers.set(BOB.toLowerCase(), ALICE);

    const deployment = {
      chainId: 998,
      airdrop: ALICE,
      tokenKHYPE: ALICE,
      tokenUSDC: ALICE,
      vaultShareHolders: [{ address: BOB, shares: "100" }],
      airdropEntries: [
        { address: BOB, amount: "8750" },
        { address: ALICE, amount: "1250" },
      ],
    };

    expect(
      computeCommissionFromReferee({
        referee: BOB,
        referrer: ALICE,
        deployment,
        referrers,
      })
    ).toBe(1250n);
  });

  it("returns zero when referee is not bound to referrer", () => {
    const referrers = new Map<string, Address>();
    referrers.set(BOB.toLowerCase(), ALICE);

    const deployment = {
      chainId: 998,
      airdrop: ALICE,
      tokenKHYPE: ALICE,
      tokenUSDC: ALICE,
      vaultShareHolders: [{ address: BOB, shares: "100" }],
      airdropEntries: [
        { address: BOB, amount: "8750" },
        { address: ALICE, amount: "1250" },
      ],
    };

    const other = "0x3333333333333333333333333333333333333333" as Address;
    expect(
      computeCommissionFromReferee({
        referee: other,
        referrer: ALICE,
        deployment,
        referrers,
      })
    ).toBe(0n);
  });
});
