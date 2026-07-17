import type { Page } from "@playwright/test";

const REGISTRY = "0x8ad08884aadd96db870c31f3a3a211510bb0ca38".toLowerCase();

const SELECTORS = {
  isRegisteredReferrer: "0x3a78b9b9",
  referralCount: "0xdb74559b",
  getReferrer: "0x4a9fefc7",
} as const;

function encodeUint256(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function encodeAddress(address: string): string {
  return `0x${address.toLowerCase().replace("0x", "").padStart(64, "0")}`;
}

function encodeBool(value: boolean): string {
  return value
    ? "0x0000000000000000000000000000000000000000000000000000000000000001"
    : "0x0000000000000000000000000000000000000000000000000000000000000000";
}

/**
 * Mock ReferralRegistry reads so a connected wallet appears registered on-chain.
 */
export async function mockRegisteredReferrerRpc(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }

    let body: { id?: number; method?: string; params?: unknown[] };
    try {
      body = request.postDataJSON();
    } catch {
      await route.continue();
      return;
    }

    if (body.method !== "eth_call" || !Array.isArray(body.params) || body.params.length < 2) {
      await route.continue();
      return;
    }

    const call = body.params[0] as { to?: string; data?: string };
    if (!call?.to || call.to.toLowerCase() !== REGISTRY || !call.data) {
      await route.continue();
      return;
    }

    const data = call.data.toLowerCase();
    let result: string | null = null;

    if (data.startsWith(SELECTORS.isRegisteredReferrer)) {
      result = encodeBool(true);
    } else if (data.startsWith(SELECTORS.referralCount)) {
      result = encodeUint256(0n);
    } else if (data.startsWith(SELECTORS.getReferrer)) {
      result = encodeAddress("0x0000000000000000000000000000000000000000");
    }

    if (!result) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
    });
  });
}

/** Mock isRegisteredReferrer lookup for a specific referrer address (invite apply flow). */
export async function mockReferrerRegisteredLookup(page: Page, registered = true) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }

    let body: { id?: number; method?: string; params?: unknown[] };
    try {
      body = request.postDataJSON();
    } catch {
      await route.continue();
      return;
    }

    if (body.method !== "eth_call" || !Array.isArray(body.params)) {
      await route.continue();
      return;
    }

    const call = body.params[0] as { to?: string; data?: string };
    if (
      !call?.to ||
      call.to.toLowerCase() !== REGISTRY ||
      !call.data?.startsWith(SELECTORS.isRegisteredReferrer)
    ) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: encodeBool(registered),
      }),
    });
  });
}
