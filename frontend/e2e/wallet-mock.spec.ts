/**
 * Injected wallet mock E2E (no MetaMask extension).
 * Validates Web3Mock provider + wallet modal UX. Full on-chain txs → Synpress testnet tests.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { headerConnectButton, prepareAppLocale } from "./helpers/ui";

const require = createRequire(`${process.cwd()}/package.json`);
const web3MockBundle = readFileSync(
  require.resolve("@depay/web3-mock/dist/umd/index.bundle.js"),
  "utf8"
);

/** Anvil account #0 — mock-only; never use deployer keys in wallet-mock E2E */
const MOCK_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

function resolveAccount(): `0x${string}` {
  return MOCK_ACCOUNT;
}

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

test.describe("Wallet mock (injected)", () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppLocale(page);
  });

  test("exposes mock accounts via window.ethereum", async ({ context, page }) => {
    const account = resolveAccount();
    await injectMockWallet(context, account);
    await page.goto("/");

    const accounts = await page.evaluate(() =>
      (window as Window & { ethereum?: { request: (a: { method: string }) => Promise<string[]> } })
        .ethereum!.request({ method: "eth_requestAccounts" })
    );
    expect(accounts[0]?.toLowerCase()).toBe(account.toLowerCase());
  });

  test("wallet modal shows enabled MetaMask and Browser Wallet", async ({ context, page }) => {
    await injectMockWallet(context, resolveAccount());
    await page.goto("/");
    await headerConnectButton(page).click();

    const modal = page.locator(".fixed.card-glass").filter({ hasText: "Connect Wallet" });
    await expect(modal).toBeVisible();

    const metaMask = modal.getByRole("button", { name: /MetaMask/i });
    await expect(metaMask).toBeVisible();
    await expect(metaMask).toContainText("MetaMask");

    await expect(modal.getByRole("button", { name: /Browser Wallet/i })).toBeEnabled();
  });

  test("can select HyperEVM Testnet in wallet modal", async ({ context, page }) => {
    await injectMockWallet(context, resolveAccount());
    await page.goto("/");
    await headerConnectButton(page).click();

    const modal = page.locator(".fixed.card-glass").filter({ hasText: "Connect Wallet" });
    await modal.getByRole("button", { name: /HyperEVM Testnet/i }).click();
    await expect(modal.getByText("Chain 998")).toBeVisible();
  });
});
