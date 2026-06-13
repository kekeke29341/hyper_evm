import type { Page } from "@playwright/test";

/** Header connect button (avoids disabled swap-tab duplicate). */
export function headerConnectButton(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: /connect wallet|ウォレット/i });
}

export async function prepareAppLocale(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("prjx_onboarding_done", "1");
    localStorage.setItem("prjx_locale", "en");
  });
}

/** Open wallet modal, pick testnet chain, connect via injected/mock wallet. */
export async function connectMockWallet(page: Page) {
  await headerConnectButton(page).click();
  const modal = page.locator(".fixed.card-glass").filter({ hasText: "Connect Wallet" });
  await modal.getByRole("button", { name: /HyperEVM Testnet/i }).click();
  const browserWallet = modal.getByRole("button", { name: /Browser Wallet/i });
  await browserWallet.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await browserWallet.click();
}
