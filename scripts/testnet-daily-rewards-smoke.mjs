#!/usr/bin/env node
/**
 * Testnet daily-rewards smoke without harvest (real USDC cannot be mock-minted on 998).
 * Simulates the 70% user pool: fund airdrop from wallet USDC + set Merkle from vaultShareHolders.
 *
 * Usage: source scripts/testnet-env.sh && POOL_USDC=0.02 node scripts/testnet-daily-rewards-smoke.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { buildMerkleRoot, attachMinShares } from "./lib/merkle.mjs";
import { buildCashdropEntries, fetchReferrerMap } from "./lib/referral-allocation.mjs";
import { sumEligibleShares } from "./lib/sync-shareholders.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const POOL_USDC = process.env.POOL_USDC ?? "0.02";

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
const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const deployment = JSON.parse(
  fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8")
);
const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
const vaultAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
);
const airdropAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"), "utf8")
);
const erc20Abi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MockERC20.json"), "utf8")
);

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const chain = {
  id: 998,
  name: "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });

if (!deployment.vaultShareHolders?.length) {
  throw new Error("vaultShareHolders required in 998.json");
}

const pool = viem.parseUnits(POOL_USDC, 6);
const eligibleShares = sumEligibleShares(deployment.vaultShareHolders);
if (eligibleShares === 0n) throw new Error("No eligible shareholders");

let referrers = new Map();
const registry = deployment.referralRegistry;
const ZERO = "0x0000000000000000000000000000000000000000";
if (registry && registry.toLowerCase() !== ZERO) {
  referrers = await fetchReferrerMap(publicClient, registry, deployment.vaultShareHolders);
  console.log(`    Referrals: ${referrers.size} bound referee(s)`);
}

const rawEntries = buildCashdropEntries({
  holders: deployment.vaultShareHolders.map((h) => ({
    address: h.address,
    shares: BigInt(h.shares),
  })),
  pending: pool,
  totalShares: eligibleShares,
  referrers,
});

const entries = attachMinShares(
  rawEntries,
  deployment.vaultShareHolders.map((h) => ({ address: h.address, shares: h.shares }))
);

const merkleRoot = buildMerkleRoot(entries, true);
const jstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
const claimEnd = new Date(jstNow);
claimEnd.setHours(9, 0, 0, 0);
if (claimEnd <= jstNow) claimEnd.setDate(claimEnd.getDate() + 1);
const deadline = BigInt(Math.floor(claimEnd.getTime() / 1000));

const walletUsdc = await publicClient.readContract({
  address: deployment.tokenUSDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});
if (walletUsdc < pool) {
  throw new Error(`Need ${POOL_USDC} USDC in wallet, have ${viem.formatUnits(walletUsdc, 6)}`);
}

console.log("==> Daily-rewards smoke (998) — manual pool fund");
console.log(`    Pool: ${POOL_USDC} USDC, ${entries.length} holder(s)`);

const appr = await walletClient.writeContract({
  address: deployment.tokenUSDC,
  abi: erc20Abi,
  functionName: "approve",
  args: [deployment.airdrop, pool],
});
await publicClient.waitForTransactionReceipt({ hash: appr });

const fund = await walletClient.writeContract({
  address: deployment.airdrop,
  abi: airdropAbi,
  functionName: "fund",
  args: [pool],
});
await publicClient.waitForTransactionReceipt({ hash: fund });

const set = await walletClient.writeContract({
  address: deployment.airdrop,
  abi: airdropAbi,
  functionName: "setMerkleRoot",
  args: [merkleRoot, deadline],
});
await publicClient.waitForTransactionReceipt({ hash: set });

deployment.airdropEntries = entries.map((e) => ({
  address: e.address,
  amount: e.amount.toString(),
  minShares: e.minShares.toString(),
}));
deployment.merkleRoot = merkleRoot;
for (const p of [
  path.join(root, "contracts/deployments/998.json"),
  path.join(root, "frontend/src/lib/contracts/deployments/998.json"),
]) {
  fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
}

console.log(`    ✓ Merkle root set — claim by ${deadline} (JST 9:00 window)`);
entries.forEach((e) => console.log(`       ${e.address}: ${viem.formatUnits(e.amount, 6)} USDC`));
