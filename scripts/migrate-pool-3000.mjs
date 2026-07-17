#!/usr/bin/env node
/**
 * Mainnet migration: deploy new ProjectXAdapter (fee=3000) + HyperpoolVault for 0.3% pool.
 *
 * Vault.adapter and Adapter.fee are immutable — this deploys a new stack.
 *
 * Env: PRIVATE_KEY / MAIN_PRIVATE_KEY, RPC_URL (optional)
 *      OLD_VAULT (default: deployments/999.json hyperpoolVault)
 *
 * Post-run:
 *   1. vault.pause() on OLD_VAULT
 *   2. Users withdraw from old vault
 *   3. keeper-rebalance.mjs with NEW_VAULT in deployment JSON
 *   4. Update contracts/deployments/999.json + frontend copy
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const f of [".env", ".env.local", ".env.mainnet", ".env.testnet"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq);
      if (!process.env[k]) process.env[k] = t.slice(eq + 1);
    }
  }
}

loadEnv();

const depPath = path.join(root, "contracts/deployments/999.json");
const deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
const oldVault = process.env.OLD_VAULT ?? deployment.hyperpoolVault;
if (!oldVault) throw new Error("OLD_VAULT or hyperpoolVault in 999.json required");

const rpc =
  process.env.RPC_URL ?? process.env.HYPEREVM_RPC ?? "https://rpc.hyperliquid.xyz/evm";
const pk = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!pk) throw new Error("Set PRIVATE_KEY or MAIN_PRIVATE_KEY");

console.log("Migrating pool 0.05% -> 0.3%");
console.log("OLD_VAULT:", oldVault);
console.log("Target pool:", "0x422e586c906eb241f784b4f5a633c2c7e59a2f54");

const env = {
  ...process.env,
  PRIVATE_KEY: (() => {
    const raw = pk.startsWith("0x") ? pk : `0x${pk}`;
    return raw;
  })(),
  OLD_VAULT: oldVault,
};

const result = spawnSync(
  "forge",
  [
    "script",
    "script/MigratePool3000.s.sol:MigratePool3000",
    "--rpc-url",
    process.env.FORGE_RPC_URL ?? "hyperEVM_mainnet",
    "--broadcast",
    "--slow",
    ...(process.env.GAS_PRICE ? ["--with-gas-price", process.env.GAS_PRICE] : ["--with-gas-price", "1000000000"]),
    "-vvv",
  ],
  { cwd: path.join(root, "contracts"), env, stdio: "inherit" }
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log("\nUpdate deployment JSON with NEW_VAULT / NEW_ADAPTER from broadcast logs above.");
console.log("Then pause old vault and migrate user deposits.");
