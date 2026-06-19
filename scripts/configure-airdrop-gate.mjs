#!/usr/bin/env node
/**
 * Configure vault share gate on MerkleAirdrop (post-deploy upgrade path).
 * Requires redeployed MerkleAirdrop with setVaultShareToken + gated claim.
 *
 * Usage: DEPLOYMENT_CHAIN=998 node scripts/configure-airdrop-gate.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const f of [".env.testnet", ".env"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
    }
  }
  let pk = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (pk && !pk.startsWith("0x")) pk = `0x${pk}`;
  process.env.PRIVATE_KEY = pk;
}

loadEnv();
const CHAIN = Number(process.env.DEPLOYMENT_CHAIN ?? "998");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const deployment = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/deployments", `${CHAIN}.json`), "utf8")
);
const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
const airdropAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"), "utf8")
);

if (!vault || !deployment.airdrop) throw new Error("vault/airdrop missing in deployment JSON");

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const chain = {
  id: CHAIN,
  name: CHAIN === 999 ? "HyperEVM" : "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });

const current = await publicClient.readContract({
  address: deployment.airdrop,
  abi: airdropAbi,
  functionName: "vaultShareToken",
});
if (current.toLowerCase() === vault.toLowerCase()) {
  console.log("vaultShareToken already configured");
  process.exit(0);
}

const hash = await walletClient.writeContract({
  address: deployment.airdrop,
  abi: airdropAbi,
  functionName: "setVaultShareToken",
  args: [vault],
});
await publicClient.waitForTransactionReceipt({ hash });
console.log("setVaultShareToken tx", hash);
console.log("Vault share gate enabled on", deployment.airdrop);
