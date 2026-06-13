import { defineWalletSetup } from "@synthetixio/synpress";
import { MetaMask } from "@synthetixio/synpress/playwright";

/** Anvil / Hardhat default account #0 */
const ANVIL_SEED = "test test test test test test test test test test test junk";

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

  await metamask.importWallet(ANVIL_SEED);

  await metamask.addNetwork({
    name: "Anvil Local",
    rpcUrl: process.env.SYNPRESS_ANVIL_RPC ?? "http://127.0.0.1:8545",
    chainId: 31337,
    symbol: "HYPE",
  });

  await metamask.toggleShowTestNetworks();
  await metamask.switchNetwork("Anvil Local", true);
});
