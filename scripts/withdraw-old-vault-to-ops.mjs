#!/usr/bin/env node
/**
 * Withdraw all shares from the legacy vault to the operator wallet.
 *
 * Requires HOLDER_PRIVATE_KEY for the wallet that holds vault shares
 * (default holder address: 0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55).
 * MAIN_PRIVATE_KEY is used only to pause the old vault after withdrawal.
 *
 * Usage:
 *   HOLDER_PRIVATE_KEY=0x... node scripts/withdraw-old-vault-to-ops.mjs
 *   # or add HOLDER_PRIVATE_KEY to .env.testnet / .env.mainnet
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL ?? "https://hyperliquid.drpc.org";
const OLD_VAULT = "0xe5f4d055c5e2d29f26862a543377c2525a41dde8";
const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";
const WHYPE = "0x5555555555555555555555555555555555555555";
const DEFAULT_HOLDER = "0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55";

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
}

function normalizePk(pk) {
  if (!pk) return null;
  return pk.startsWith("0x") ? pk : `0x${pk}`;
}

loadEnv();

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { formatUnits } = viem;
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const holderPk = normalizePk(process.env.HOLDER_PRIVATE_KEY);
const mainPk = normalizePk(process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY);
if (!holderPk) {
  throw new Error(
    "Set HOLDER_PRIVATE_KEY for the share holder wallet (0xf35208bf…). MAIN_PRIVATE_KEY cannot withdraw others' shares."
  );
}
if (!mainPk) {
  throw new Error("Set MAIN_PRIVATE_KEY for vault owner (pause after withdraw).");
}

const holder = privateKeyToAccount(holderPk);
const main = privateKeyToAccount(mainPk);
const expectedHolder = (process.env.HOLDER_ADDRESS ?? DEFAULT_HOLDER).toLowerCase();
if (holder.address.toLowerCase() !== expectedHolder) {
  throw new Error(
    `HOLDER_PRIVATE_KEY maps to ${holder.address}, expected holder ${expectedHolder}`
  );
}

const vaultAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
);
const erc20Abi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MockERC20.json"), "utf8")
);

const chain = {
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const holderWallet = viem.createWalletClient({ account: holder, chain, transport: viem.http(RPC) });
const mainWallet = viem.createWalletClient({ account: main, chain, transport: viem.http(RPC) });

async function send(wallet, label, request) {
  console.log(`==> ${label}`);
  const hash = await wallet.writeContract(request);
  console.log("   tx", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed`);
  return hash;
}

const [paused, shares, assetsBefore] = await Promise.all([
  publicClient.readContract({ address: OLD_VAULT, abi: vaultAbi, functionName: "paused" }),
  publicClient.readContract({
    address: OLD_VAULT,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: [holder.address],
  }),
  publicClient.readContract({ address: OLD_VAULT, abi: vaultAbi, functionName: "totalAssetsUsdc" }),
]);

console.log("Holder:", holder.address);
console.log("Receiver (ops):", main.address);
console.log("Shares:", shares.toString());
console.log("Vault assets:", formatUnits(assetsBefore, 6), "USDC");
console.log("Paused:", paused);

if (shares === 0n) {
  console.log("No shares to withdraw — already empty for this holder.");
  process.exit(0);
}

if (paused) {
  await send(mainWallet, "oldVault.unpause", {
    address: OLD_VAULT,
    abi: vaultAbi,
    functionName: "unpause",
  });
}

const usdcBefore = await publicClient.readContract({
  address: USDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [main.address],
});
const whypeBefore = await publicClient.readContract({
  address: WHYPE,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [main.address],
});

await send(holderWallet, "oldVault.withdraw → ops", {
  address: OLD_VAULT,
  abi: vaultAbi,
  functionName: "withdraw",
  args: [shares, main.address],
});

const [usdcAfter, whypeAfter, sharesAfter, assetsAfter] = await Promise.all([
  publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [main.address] }),
  publicClient.readContract({ address: WHYPE, abi: erc20Abi, functionName: "balanceOf", args: [main.address] }),
  publicClient.readContract({
    address: OLD_VAULT,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: [holder.address],
  }),
  publicClient.readContract({ address: OLD_VAULT, abi: vaultAbi, functionName: "totalAssetsUsdc" }),
]);

console.log("\nWithdrawn to ops:");
console.log("  USDC:", formatUnits(usdcAfter - usdcBefore, 6));
console.log("  WHYPE:", formatUnits(whypeAfter - whypeBefore, 18));
console.log("Holder shares left:", sharesAfter.toString());
console.log("Vault assets left:", formatUnits(assetsAfter, 6), "USDC");

const stillPaused = await publicClient.readContract({
  address: OLD_VAULT,
  abi: vaultAbi,
  functionName: "paused",
});
if (!stillPaused) {
  await send(mainWallet, "oldVault.pause", {
    address: OLD_VAULT,
    abi: vaultAbi,
    functionName: "pause",
  });
}

console.log("\nDone.");
