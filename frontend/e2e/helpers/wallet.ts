import type { BrowserContext, Page } from "@playwright/test";
import { MetaMask } from "@synthetixio/synpress/playwright";
import { prepareAppLocale, headerConnectButton } from "./ui";

export async function prepareApp(page: Page) {
  await prepareAppLocale(page);
}

export async function connectViaMetaMask(
  page: Page,
  context: BrowserContext,
  metamaskPage: Page,
  password: string,
  extensionId: string
): Promise<MetaMask> {
  const metamask = new MetaMask(context, metamaskPage, password, extensionId);

  await prepareApp(page);
  await page.goto("/");

  await headerConnectButton(page).click();
  await page.getByRole("button", { name: /MetaMask/i }).first().click();

  await metamask.connectToDapp();

  // Network add/switch prompts (first connect on 998)
  for (const action of [
    () => metamask.approveNewNetwork(),
    () => metamask.approveSwitchNetwork(),
  ]) {
    try {
      await action();
    } catch {
      /* prompt may not appear */
    }
  }

  return metamask;
}

export async function confirmPendingTx(metamask: MetaMask, max = 3) {
  for (let i = 0; i < max; i++) {
    try {
      await metamask.confirmTransaction();
      await metamask.goBackToHomePage();
    } catch {
      break;
    }
  }
}
