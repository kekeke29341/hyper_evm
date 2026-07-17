#!/usr/bin/env node
/** Unpause previous vault so shareholders can withdraw and redeposit to the new vault. */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL ?? "https://rpc.hyperliquid.xyz/evm";

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
  let pk = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (pk && !pk.startsWith("0x")) pk = `0x${pk}`;
  process.env.PRIVATE_KEY = pk;
}

loadEnv();
if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY required");

const dep = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/999.json"), "utf8"));
const OLD_VAULT = dep.previousHyperpoolVault ?? dep.previousVault;
if (!OLD_VAULT) throw new Error("previousHyperpoolVault missing in 999.json");

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);
const vaultAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
);

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const chain = {
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });

const paused = await publicClient.readContract({
  address: OLD_VAULT,
  abi: vaultAbi,
  functionName: "paused",
});
if (!paused) {
  console.log("Old vault already unpaused:", OLD_VAULT);
  process.exit(0);
}

const hash = await walletClient.writeContract({
  address: OLD_VAULT,
  abi: vaultAbi,
  functionName: "unpause",
  gas: 500_000n,
});
console.log("unpause tx", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("unpause failed");
console.log("Old vault unpaused for shareholder migration:", OLD_VAULT);
console.log("New vault:", dep.hyperpoolVault);
