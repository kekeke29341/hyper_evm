import { describe, it, expect } from "vitest";
import {
  buildReferralUrl,
  isValidReferralCodePlain,
  referralCodeStorageKey,
} from "@/lib/referral/codeStorage";

describe("referral codeStorage", () => {
  it("validates plain codes", () => {
    expect(isValidReferralCodePlain("AB12")).toBe(true);
    expect(isValidReferralCodePlain("REFGUI2026")).toBe(true);
    expect(isValidReferralCodePlain("abc")).toBe(false);
    expect(isValidReferralCodePlain("bad code")).toBe(false);
    expect(isValidReferralCodePlain("A".repeat(17))).toBe(false);
  });

  it("builds referral URL", () => {
    expect(buildReferralUrl("https://app.example", "MYCODE")).toBe(
      "https://app.example/?ref=MYCODE"
    );
  });

  it("storage key is chain and address scoped", () => {
    expect(referralCodeStorageKey(998, "0xAbC")).toContain("998");
    expect(referralCodeStorageKey(998, "0xAbC")).toContain("0xabc");
  });
});
