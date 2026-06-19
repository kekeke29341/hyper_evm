#!/usr/bin/env node
/**
 * Snapshot vaultShareHolders from on-chain Transfer events + balanceOf.
 * Usage: source scripts/testnet-env.sh && node scripts/testnet-sync-shareholders.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { syncVaultShareHolders } from "./lib/sync-shareholders.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN = 998;
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";

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
}

loadEnv();
const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const pk = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!pk) throw new Error("Set MAIN_PRIVATE_KEY in .env.testnet");
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);

const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8"));
const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
const vaultAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
);

const publicClient = viem.createPublicClient({
  chain: { id: CHAIN, name: "HyperEVM Testnet" },
  transport: viem.http(RPC),
});

const holders = await syncVaultShareHolders({
  root,
  chain: CHAIN,
  deployment,
  publicClient,
  vault,
  vaultAbi,
  extraAddresses: [account.address],
});

console.log("==> Synced vaultShareHolders (998)");
holders.forEach((h) => console.log(`    ${h.address}: ${h.shares} shares`));
