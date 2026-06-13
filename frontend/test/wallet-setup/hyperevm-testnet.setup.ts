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

function requireE2ePrivateKey(): string {
  const raw = process.env.E2E_PRIVATE_KEY ?? process.env.SYNPRESS_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "E2E_PRIVATE_KEY (or SYNPRESS_PRIVATE_KEY) is required — MAIN_PRIVATE_KEY fallback is not allowed"
    );
  }
  if (process.env.MAIN_PRIVATE_KEY && raw === process.env.MAIN_PRIVATE_KEY) {
    throw new Error("E2E_PRIVATE_KEY must not be the deployer MAIN_PRIVATE_KEY");
  }
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

export default defineWalletSetup(requirePassword(), async (context, walletPage) => {
  const password = requirePassword();
  const metamask = new MetaMask(context, walletPage, password);

  await metamask.importWallet(BOOTSTRAP_SEED);

  const pk = requireE2ePrivateKey();
  try {
    await metamask.importWalletFromPrivateKey(pk);
  } catch (e) {
    console.warn("[wallet-setup] importWalletFromPrivateKey skipped:", e);
  }

  await metamask.addNetwork({
    name: "HyperEVM Testnet",
    rpcUrl: process.env.SYNPRESS_TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet",
    chainId: 998,
    symbol: "HYPE",
    blockExplorerUrl: "https://testnet.purrsec.com",
  });

  await metamask.toggleShowTestNetworks();
  await metamask.switchNetwork("HyperEVM Testnet", true);
});
