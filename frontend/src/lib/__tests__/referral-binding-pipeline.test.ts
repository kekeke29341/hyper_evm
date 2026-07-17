import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAddress, type Address } from "viem";
import {
  buildReferralUrl,
  captureReferralFromLocation,
  loadPendingReferrerAddress,
  parseReferralSearchParams,
} from "@/lib/referral/codeStorage";
import { resolveReferrer } from "@/lib/referral/resolveReferrer";
import { getDeployment } from "@/lib/contracts";
import { defaultChain } from "@/lib/wagmi/config";

const ALICE = "0x0196f2949FbcE973d54d2047E3B8bfAde06e8cec" as const;
const BOB = "0x2222222222222222222222222222222222222222" as const;
const REGISTRY = getDeployment(defaultChain.id)?.referralRegistry as Address;

function mockClient(registeredByAddress: Record<string, boolean>) {
  return {
    readContract: vi.fn(async ({ args }: { args: [Address] }) => {
      const addr = args[0].toLowerCase();
      return registeredByAddress[addr] ?? false;
    }),
  } as never;
}

describe("referral binding pipeline (frontend)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("share link round-trips through URL parse and pending storage", () => {
    const url = buildReferralUrl("https://app.example", ALICE);
    const parsed = parseReferralSearchParams(url.split("?")[1] ?? "");
    expect(parsed.referrerAddress).toBe(getAddress(ALICE));

    window.history.replaceState({}, "", url.split("app.example")[1]);
    captureReferralFromLocation();
    expect(loadPendingReferrerAddress()).toBe(getAddress(ALICE));
  });

  it("resolveReferrer returns registered referrer for link address", async () => {
    const client = mockClient({ [ALICE.toLowerCase()]: true });
    const result = await resolveReferrer(client, REGISTRY, ALICE);
    expect(result).toEqual({ kind: "referrer", referrer: getAddress(ALICE) });
  });

  it("resolveReferrer rejects unregistered referrer", async () => {
    const client = mockClient({ [BOB.toLowerCase()]: false });
    const result = await resolveReferrer(client, REGISTRY, BOB);
    expect(result).toEqual({ kind: "invalid" });
  });

  it("bind target equals resolved referrer from invite link flow", async () => {
    window.history.replaceState({}, "", `/affiliate?referrer=${ALICE}`);
    captureReferralFromLocation();

    const pending = loadPendingReferrerAddress();
    expect(pending).toBe(getAddress(ALICE));

    const client = mockClient({ [ALICE.toLowerCase()]: true });
    const resolution = await resolveReferrer(client, REGISTRY, pending ?? "");
    expect(resolution.kind).toBe("referrer");
    if (resolution.kind === "referrer") {
      // bindReferrer(resolution.referrer) — same address the contract expects
      expect(resolution.referrer).toBe(getAddress(ALICE));
    }
  });

  it("production deployment has referral registry on app target chain", () => {
    const deployment = getDeployment(defaultChain.id);
    expect(deployment?.referralRegistry).toBeTruthy();
    expect(deployment?.referralRegistry?.toLowerCase()).toBe(
      "0x3934abcb5824326b59debdb7c3410a7648b09cd2"
    );
  });
});
