/**
 * Synpress + MetaMask on-chain E2E against HyperEVM Testnet (998).
 *
 * Prerequisites:
 *   source ../scripts/testnet-env.sh
 *   npm run test:e2e:synpress:cache
 *   RUN_TESTNET_E2E=true npm run test:e2e:wallet:testnet
 */
import { testWithSynpress } from "@synthetixio/synpress-core";
import { MetaMask, metaMaskFixtures } from "@synthetixio/synpress-metamask/playwright";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import sourceSetup from "../test/wallet-setup/hyperevm-testnet.setup.ts";
import { connectViaMetaMask, confirmPendingTx } from "./helpers/wallet.ts";

/** Cache build hashes the compiled setup; tsx import differs — read cached hash when present. */
function loadWalletSetup() {
  const hashFile = join(process.cwd(), ".cache-synpress/.wallet-setup-hash");
  if (existsSync(hashFile)) {
    return { ...sourceSetup, hash: readFileSync(hashFile, "utf8").trim() };
  }
  return sourceSetup;
}

const hyperevmSetup = loadWalletSetup();

const test = testWithSynpress(metaMaskFixtures(hyperevmSetup));
const { expect } = test;

const hasKey = !!(
  process.env.SYNPRESS_PRIVATE_KEY ||
  process.env.MAIN_PRIVATE_KEY ||
  process.env.PRIVATE_KEY
);
const runTestnet = process.env.RUN_TESTNET_E2E === "true";

function expectedAddress(): string {
  const raw =
    process.env.SYNPRESS_PRIVATE_KEY ??
    process.env.MAIN_PRIVATE_KEY ??
    process.env.PRIVATE_KEY ??
    "";
  const pk = raw.startsWith("0x") ? raw : `0x${raw}`;
  return privateKeyToAccount(pk as `0x${string}`).address;
}

test.describe("Testnet wallet (Synpress)", () => {
  test.skip(!hasKey || !runTestnet, "Set RUN_TESTNET_E2E=true and MAIN_PRIVATE_KEY in env");

  test("connects MetaMask and shows truncated address", async ({
    context,
    page,
    metamaskPage,
    extensionId,
  }) => {
    await connectViaMetaMask(
      page,
      context,
      metamaskPage,
      hyperevmSetup.walletPassword,
      extensionId
    );

    const addr = expectedAddress();
    const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    await expect(page.getByRole("button", { name: new RegExp(short, "i") })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("cashdrop tab: claim or shows already claimed", async ({
    context,
    page,
    metamaskPage,
    extensionId,
  }) => {
    await connectViaMetaMask(
      page,
      context,
      metamaskPage,
      hyperevmSetup.walletPassword,
      extensionId
    );

    await page.goto("/cashdrop");

    const claimBtn = page.getByRole("button", { name: /claim cashdrop|claim/i }).first();
    const emptyState = page.getByText(/already claimed|no cashdrop|empty|請求済|対象外/i);

    if (await claimBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await claimBtn.click();
      const metamask = new MetaMask(context, metamaskPage, hyperevmSetup.walletPassword, extensionId);
      await confirmPendingTx(metamask, 2);
      await expect(page.getByText(/success|claimed|USDC/i).first()).toBeVisible({ timeout: 60_000 });
    } else {
      await expect(emptyState.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test("swap: small WHYPE → USDC on Hyperpool", async ({
    context,
    page,
    metamaskPage,
    extensionId,
  }) => {
    await connectViaMetaMask(
      page,
      context,
      metamaskPage,
      hyperevmSetup.walletPassword,
      extensionId
    );

    await page.getByRole("button", { name: /^swap$/i }).click();

    const amountInput = page.locator('input[inputmode="decimal"]').first();
    await amountInput.fill("0.001");

    await page.getByRole("button", { name: /^swap$/i }).last().click();

    const metamask = new MetaMask(context, metamaskPage, hyperevmSetup.walletPassword, extensionId);
    await confirmPendingTx(metamask, 3);

    await expect(page.getByText(/success|swapped|complete/i).first()).toBeVisible({ timeout: 90_000 });
  });
});
