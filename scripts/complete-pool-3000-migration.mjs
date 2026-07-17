#!/usr/bin/env node
/**
 * Complete pending 0.3% pool migration steps after partial forge broadcast.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL ?? "https://hyperliquid.drpc.org";

const NEW_ADAPTER = "0xa6CCDC039e09889ed6E7ee8377e384F0772b706a";
const NEW_VAULT = "0xF749790D37cc125B6F5d2BC5a64B56577a26d394";
const OLD_VAULT = "0xe5f4d055c5e2d29f26862a543377c2525a41dde8";
const POOL = "0x422e586C906eb241f784B4F5a633c2C7e59A2F54";
const SWAP_ROUTER = "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B";
const AIRDROP = "0x67d45f8535ec3f268f1acb0fe69ec87ad7aa7431";

function loadEnv() {
  for (const f of [".env", ".env.local", ".env.testnet", ".env.mainnet"]) {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

loadEnv();
if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY required");

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const adapterAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/ProjectXAdapter.json"), "utf8")
);
const vaultAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
);
const airdropAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"), "utf8")
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

async function send(label, request) {
  console.log(`==> ${label}`);
  const hash = await walletClient.writeContract(request);
  console.log("   tx", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed`);
  await sleep(2000);
  return hash;
}

async function readState() {
  const [adapterVault, adapterPool, adapterFee, vaultRouter, airdropVault, oldPaused] = await Promise.all([
    publicClient.readContract({ address: NEW_ADAPTER, abi: adapterAbi, functionName: "vault" }),
    publicClient.readContract({ address: NEW_ADAPTER, abi: adapterAbi, functionName: "pool" }),
    publicClient.readContract({ address: NEW_ADAPTER, abi: adapterAbi, functionName: "fee" }),
    publicClient.readContract({ address: NEW_VAULT, abi: vaultAbi, functionName: "swapRouter" }),
    publicClient.readContract({ address: AIRDROP, abi: airdropAbi, functionName: "vaultShareToken" }),
    publicClient.readContract({ address: OLD_VAULT, abi: vaultAbi, functionName: "paused" }),
  ]);
  return { adapterVault, adapterPool, adapterFee, vaultRouter, airdropVault, oldPaused };
}

let state = await readState();
console.log("Before:", state);

if (state.adapterVault?.toLowerCase() !== NEW_VAULT.toLowerCase()) {
  await send("adapter.setVault", {
    address: NEW_ADAPTER,
    abi: adapterAbi,
    functionName: "setVault",
    args: [NEW_VAULT],
  });
}

if (!state.adapterPool || state.adapterPool === "0x0000000000000000000000000000000000000000") {
  await send("adapter.setPool", {
    address: NEW_ADAPTER,
    abi: adapterAbi,
    functionName: "setPool",
    args: [POOL],
  });
}

if (!state.vaultRouter || state.vaultRouter === "0x0000000000000000000000000000000000000000") {
  await send("vault.setSwapRouter", {
    address: NEW_VAULT,
    abi: vaultAbi,
    functionName: "setSwapRouter",
    args: [SWAP_ROUTER],
  });
  await send("vault.setFeeSplit", {
    address: NEW_VAULT,
    abi: vaultAbi,
    functionName: "setFeeSplit",
    args: [700n, 3300n],
  });
  await send("vault.setConvertHypeFeesToUsdc", {
    address: NEW_VAULT,
    abi: vaultAbi,
    functionName: "setConvertHypeFeesToUsdc",
    args: [true],
  });
  await send("vault.setFeeSwapSlippageBps", {
    address: NEW_VAULT,
    abi: vaultAbi,
    functionName: "setFeeSwapSlippageBps",
    args: [50n],
  });
  await send("vault.setMaxRebalanceDeviationBps", {
    address: NEW_VAULT,
    abi: vaultAbi,
    functionName: "setMaxRebalanceDeviationBps",
    args: [500n],
  });
}

state = await readState();
if (state.airdropVault?.toLowerCase() !== NEW_VAULT.toLowerCase()) {
  await send("airdrop.setVaultShareToken", {
    address: AIRDROP,
    abi: airdropAbi,
    functionName: "setVaultShareToken",
    args: [NEW_VAULT],
  });
}

if (!state.oldPaused) {
  await send("oldVault.pause", {
    address: OLD_VAULT,
    abi: vaultAbi,
    functionName: "pause",
  });
}

state = await readState();
console.log("After:", state);

const depPath = path.join(root, "contracts/deployments/999.json");
const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
const updated = {
  ...dep,
  hyperpoolVault: NEW_VAULT,
  liquidityVault: NEW_VAULT,
  projectXAdapter: NEW_ADAPTER,
  projectXPool: POOL,
  previousVault: OLD_VAULT,
  previousAdapter: dep.projectXAdapter,
  poolMigratedAt: new Date().toISOString(),
};
const json = `${JSON.stringify(updated, null, 2)}\n`;
fs.writeFileSync(depPath, json);
fs.writeFileSync(path.join(root, "frontend/src/lib/contracts/deployments/999.json"), json);

console.log("\nDeployment JSON updated.");
console.log("NEW_VAULT", NEW_VAULT);
console.log("NEW_ADAPTER", NEW_ADAPTER);
console.log("OLD_VAULT paused — users must withdraw and redeposit to new vault.");
