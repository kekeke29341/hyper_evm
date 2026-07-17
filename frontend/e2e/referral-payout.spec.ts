/**
 * Referral commission history + Cashdrop tx links (GUI smoke).
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { headerConnectButton, prepareAppLocale, walletModal } from "./helpers/ui";

const require = createRequire(`${process.cwd()}/package.json`);
const web3MockBundle = readFileSync(
  require.resolve("@depay/web3-mock/dist/umd/index.bundle.js"),
  "utf8"
);

/** Testnet vault holder with airdrop entry in 998.json */
const TESTNET_HOLDER = "0x0196f2949fbce973d54d2047e3b8bfade06e8cec" as const;

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
  await expect(page.getByRole("banner").getByText(/0x0196/i)).toBeVisible({ timeout: 15_000 });
}

test.describe("Referral payout GUI", () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppLocale(page);
  });

  test("guest: affiliate and dashboard load without client errors", async ({ page }) => {
    for (const path of ["/affiliate", "/", "/cashdrop"]) {
      await page.goto(path);
      await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
    }
  });

  test("guest: referral payout sections stay hidden until eligible", async ({ page }) => {
    await page.goto("/affiliate");
    await expect(page.getByText(/Your referrer's daily earnings/i)).toHaveCount(0);
    await expect(page.getByText(/Your referral commission \(daily\)/i)).toHaveCount(0);
  });

  test("connected holder: dashboard shows payout history block", async ({ context, page }) => {
    test.setTimeout(90_000);
    await injectMockWallet(context, TESTNET_HOLDER);
    await page.goto("/");
    await connectTestnetWallet(page);

    await expect(page.getByRole("heading", { name: /Payout history/i })).toBeVisible({
      timeout: 20_000,
    });

    const payoutCard = page.locator("main").filter({ has: page.getByRole("heading", { name: /Payout history/i }) });
    const txLink = payoutCard.locator('a[href*="purrsec.com/tx/"]').first();
    const empty = payoutCard.getByText(/No payout history yet/i);

    await expect(txLink.or(empty)).toBeVisible({ timeout: 60_000 });

    if (await txLink.isVisible()) {
      await expect(txLink).toHaveAttribute("href", /purrsec\.com\/tx\/0x[a-fA-F0-9]+/);
    } else {
      await expect(empty).toBeVisible();
    }
  });

  test("connected holder: affiliate payout table headers when referral data exists", async ({
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    await injectMockWallet(context, TESTNET_HOLDER);

    await page.addInitScript(() => {
      const key =
        "hyperpool_referral_from-referee_998_0x0196f2949fbce973d54d2047e3b8bfade06e8cec";
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            t: Date.now() - 86_400_000,
            usdc: 0.42,
            txHash: "0xb171aaf4f06d530467866063cd347af664f7a6390812d97686621f473932673e",
            kind: "from-referee",
          },
        ])
      );
    });

    await page.goto("/affiliate");
    await connectTestnetWallet(page);

    // Referee boost may or may not be on-chain for this wallet; seeded local row should still render
    // when hasRefereeBoost becomes true after RPC. Wait for page settle.
    await page.waitForTimeout(3_000);

    const hasReferrerSection = await page
      .getByText(/Your referrer's daily earnings/i)
      .isVisible()
      .catch(() => false);

    if (hasReferrerSection) {
      await expect(page.getByRole("columnheader", { name: /Payout tx/i })).toBeVisible();
      const txLink = page.locator('a[href*="testnet.purrsec.com/tx/"]').first();
      await expect(txLink).toBeVisible({ timeout: 10_000 });
    } else {
      // Wallet may not have referee boost on-chain — ensure affiliate still healthy
      await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
      await expect(page.getByText(/Affiliate/i).first()).toBeVisible();
    }
  });
});
