import { describe, it, expect } from "vitest";
import {
  buildReferralUrl,
  parseReferralSearchParams,
} from "@/lib/referral/codeStorage";

const REFERRER = "0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC";

describe("referral codeStorage", () => {
  it("builds wallet-based referral URL", () => {
    expect(buildReferralUrl("https://app.example", REFERRER)).toBe(
      `https://app.example/affiliate?referrer=${REFERRER}`
    );
  });

  it("parses referrer query param (accepts any valid 0x address form)", () => {
    expect(parseReferralSearchParams(`?referrer=${REFERRER}`)).toEqual({
      referrerAddress: REFERRER,
    });
    expect(
      parseReferralSearchParams("?referrer=0x0196f2949fbce973d54d2047e3b8bfade06e8cec")
    ).toEqual({
      referrerAddress: REFERRER,
    });
    expect(parseReferralSearchParams("")).toEqual({
      referrerAddress: null,
    });
  });
});
