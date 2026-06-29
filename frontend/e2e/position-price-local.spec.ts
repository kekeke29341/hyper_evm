/**
 * Local-only GUI check: spot price loading + deposit modal range bounds.
 * Run: PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/position-price-local.spec.ts --project=wallet-mock
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

const MOCK_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

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
      const provider = window.ethereum;
      if (!provider?.request) return;
      const base = provider.request.bind(provider);
      provider.request = async (args: { method: string; params?: unknown[] }) => {
        if (args.method === "eth_chainId") return "0x3e7";
        if (args.method === "net_version") return "999";
        if (args.method === "wallet_switchEthereumChain") return null;
        if (args.method === "wallet_addEthereumChain") return null;
        return base(args);
      };
    },
    { bundle: web3MockBundle, account: address }
  );
}

test.describe("Position price + deposit modal (local GUI)", () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppLocale(page);
    await page.addInitScript(() => {
      localStorage.setItem("prjx_locale", "ja");
    });
  });

  test("shows loading then live price; deposit modal has range bounds", async ({ context, page }) => {
    await injectMockWallet(context, MOCK_ACCOUNT);
    await page.goto("/position");

    const priceLine = page.getByText(/現在価格.*USDC\/HYPE/i).first();
    await expect(priceLine).toContainText(/読み込み中|Loading/i, { timeout: 5000 }).catch(() => {});

    await headerConnectButton(page).click();
    const modal = walletModal(page);
    await modal.getByRole("button", { name: /Chain 999|mainnet/i }).click();
    const browserWallet = modal.getByRole("button", { name: /^ブラウザウォレット|^Browser Wallet/i }).first();
    await browserWallet.click();
    await expect(headerConnectButton(page)).not.toBeVisible({ timeout: 15_000 });

    await expect(priceLine).toContainText(/\d{2,}/, { timeout: 30_000 });

    await page.getByRole("button", { name: /Vault に預ける/i }).first().click();
    const depositModal = page.getByRole("dialog");
    await expect(depositModal).toBeVisible();

    await expect(depositModal.getByText(/現在価格.*\d{2,}/)).toBeVisible({ timeout: 30_000 });

    const rangeSection = depositModal.locator("section").filter({ hasText: "リバランスレンジ" });
    const lower = rangeSection.locator("p.tabular-nums").nth(0);
    const upper = rangeSection.locator("p.tabular-nums").nth(1);
    await expect(lower).toHaveText(/^\d[\d,]*$/, { timeout: 15_000 });
    await expect(upper).toHaveText(/^\d[\d,]*$/, { timeout: 15_000 });

    const lowerNum = Number((await lower.textContent())?.replace(/,/g, "") ?? "0");
    const upperNum = Number((await upper.textContent())?.replace(/,/g, "") ?? "0");
    expect(lowerNum).toBeGreaterThan(10);
    expect(upperNum).toBeGreaterThan(lowerNum);

    await depositModal.locator('input[inputmode="decimal"]').fill("10");
    await expect(depositModal.getByRole("button", { name: /確認画面へ|確認へ|to confirm/i })).toBeDisabled();
  });
});
