import { describe, it, expect, vi } from "vitest";
import { getAddress } from "viem";
import { resolveReferrer } from "@/lib/referral/resolveReferrer";

const REGISTRY = "0xd3439a2b33b48f7ddaa45cd2f0f89de12e36c806" as const;
const REFERRER = "0x0196f2949FbcE973d54d2047E3B8bfAde06e8cec" as const;

function mockClient(registered: boolean) {
  return {
    readContract: vi.fn().mockResolvedValue(registered),
  } as never;
}

describe("resolveReferrer", () => {
  it("resolves a registered referrer address", async () => {
    const result = await resolveReferrer(mockClient(true), REGISTRY, REFERRER);
    expect(result).toEqual({ kind: "referrer", referrer: getAddress(REFERRER) });
  });

  it("rejects unregistered referrer", async () => {
    const result = await resolveReferrer(mockClient(false), REGISTRY, REFERRER);
    expect(result).toEqual({ kind: "invalid" });
  });

  it("rejects invalid input", async () => {
    const result = await resolveReferrer(mockClient(true), REGISTRY, "not-an-address");
    expect(result).toEqual({ kind: "invalid" });
  });
});
