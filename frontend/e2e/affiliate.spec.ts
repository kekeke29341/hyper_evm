/**
 * Affiliate tab + wallet-address referral flow.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { headerConnectButton, prepareAppLocale, walletModal } from "./helpers/ui";
import { mockRegisteredReferrerRpc } from "./helpers/referralRpc";

const require = createRequire(`${process.cwd()}/package.json`);
const web3MockBundle = readFileSync(
  require.resolve("@depay/web3-mock/dist/umd/index.bundle.js"),
  "utf8"
);

const REGISTERED_REFERRER = "0x0196f2949fbce973d54d2047e3b8bfade06e8cec" as const;
const INVITE_REFERRER = "0x1111111111111111111111111111111111111111" as const;

async function injectMockWallet(
  context: import("@playwright/test").BrowserContext,
  address: string
) {
  await context.addInitScript(
    ({ bundle, account }: { bundle: string; account: string }) => {
      eval(bundle);
      Web3Mock.mock({
        blockchain: "ethereum",
        wallet: "metamask",
        accounts: { return: [account] },
      });
    },
    { bundle: web3MockBundle, account: address }
  );
}

async function connectTestnetWallet(page: import("@playwright/test").Page) {
  await headerConnectButton(page).click();
  const modal = walletModal(page);
  await modal.getByRole("button", { name: /HyperEVM Testnet/i }).click();
  const browserWallet = modal.getByRole("button", { name: /^Browser Wallet/i }).last();
  await browserWallet.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await browserWallet.click();
  await expect(page.getByRole("banner").getByText(/0x/i)).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await prepareAppLocale(page);
});

test.describe("Affiliate tab (guest)", () => {
  test("shows connect-to-activate prompt without referral link", async ({ page }) => {
    await page.goto("/affiliate");

    await expect(page.getByText(/Connect your wallet to activate the referral program/i)).toBeVisible();
    await expect(page.getByText(/Your referral link/i)).toHaveCount(0);
    await expect(page.getByPlaceholder("0x")).toHaveCount(0);
  });

  test("explains referral normalization and referrer address field", async ({ page }) => {
    await page.goto("/affiliate");

    await expect(page.getByText(/fixed USDC pool/i)).toBeVisible();
    await expect(page.getByPlaceholder("0x…")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Apply$/i })).toBeVisible();
  });

  test("?referrer= link shows pending invite banner", async ({ page }) => {
    await page.goto(`/affiliate?referrer=${REGISTERED_REFERRER}`);

    await expect(page.getByText(/Referral link detected/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Apply$/i })).toBeEnabled();
  });
});

test.describe("Affiliate tab (registered referrer)", () => {
  test("shows copyable wallet link for registered referrer", async ({ context, page }) => {
    test.setTimeout(90_000);

    await mockRegisteredReferrerRpc(page);
    await injectMockWallet(context, REGISTERED_REFERRER);

    await page.goto("/affiliate");
    await connectTestnetWallet(page);

    await expect(page.getByText(/Your referral link/i).first()).toBeVisible({ timeout: 20_000 });

    const linkInput = page.locator('input[readonly][value*="affiliate?referrer="]');
    await expect(linkInput).toBeVisible({ timeout: 15_000 });
    await expect(linkInput).toHaveValue(new RegExp(`referrer=${REGISTERED_REFERRER}`, "i"));

    await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
  });

  test("?referrer= on invite link enables apply for connected referee", async ({ context, page }) => {
    test.setTimeout(90_000);

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
      const registry = "0x8ad08884aadd96db870c31f3a3a211510bb0ca38";
      // isRegisteredReferrer(address)
      if (call?.to?.toLowerCase() !== registry || !call.data?.startsWith("0x3a78b9b9")) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
        }),
      });
    });

    await injectMockWallet(context, "0x2222222222222222222222222222222222222222");
    await page.goto(`/affiliate?referrer=${INVITE_REFERRER}`);

    await expect(page.getByText(/Referral link detected/i)).toBeVisible();
    await connectTestnetWallet(page);
    await expect(page.getByRole("button", { name: /^Apply$/i })).toBeEnabled();
  });
});
