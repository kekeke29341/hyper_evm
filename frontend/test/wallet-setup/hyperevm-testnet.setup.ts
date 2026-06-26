import { defineWalletSetup } from "@synthetixio/synpress";
import { MetaMask } from "@synthetixio/synpress/playwright";

const BOOTSTRAP_SEED =
  "test test test test test test test test test test test junk";

function requirePassword(): string {
  const password = process.env.SYNPRESS_WALLET_PASSWORD;
  if (!password) {
    throw new Error(
      "SYNPRESS_WALLET_PASSWORD is required for Synpress wallet setup (do not use default passwords)"
    );
  }
  return password;
}

export default defineWalletSetup(requirePassword(), async (context, walletPage) => {
  const password = requirePassword();
  const metamask = new MetaMask(context, walletPage, password);

  await metamask.importWallet(BOOTSTRAP_SEED);

  // HyperEVM Testnet (998) is added/switched on first dapp connect in connectViaMetaMask().
});
