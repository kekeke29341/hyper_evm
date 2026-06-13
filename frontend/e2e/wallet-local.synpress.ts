/**
 * Synpress E2E on local Anvil (31337). Requires: ./scripts/dev-local.sh
 * RUN_LOCAL_E2E=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e:wallet:local
 */
import { testWithSynpress } from "@synthetixio/synpress-core";
import { metaMaskFixtures } from "@synthetixio/synpress-metamask/playwright";
import anvilSetup from "../test/wallet-setup/anvil-local.setup.ts";
import { connectViaMetaMask } from "./helpers/wallet.ts";

const test = testWithSynpress(metaMaskFixtures(anvilSetup));
const { expect } = test;

const runLocal = process.env.RUN_LOCAL_E2E === "true";

test.describe("Local Anvil wallet (Synpress)", () => {
  test.skip(!runLocal, "Set RUN_LOCAL_E2E=true and start ./scripts/dev-local.sh");

  test("connects on chain 31337", async ({ context, page, metamaskPage, extensionId }) => {
    await connectViaMetaMask(page, context, metamaskPage, anvilSetup.walletPassword, extensionId);
    await expect(page.getByText(/0xf39f/i)).toBeVisible({ timeout: 15_000 });
  });
});
