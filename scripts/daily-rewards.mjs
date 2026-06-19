#!/usr/bin/env node
/**
 * Daily fee harvest: collect Project X fees → 30% operator / 70% Merkle USDC.
 * Schedule: JST 07:00 (use cron TZ=Asia/Tokyo)
 *
 * Env: PRIVATE_KEY, RPC_URL (999), OPERATOR_WALLET, DEPLOYMENT_CHAIN=999
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { buildMerkleRoot, attachMinShares } from "./lib/merkle.mjs";
import { buildCashdropEntries, fetchReferrerMap } from "./lib/referral-allocation.mjs";
import { sumEligibleShares, syncVaultShareHolders } from "./lib/sync-shareholders.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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

loadEnv();
const CHAIN = Number(process.env.DEPLOYMENT_CHAIN ?? "999");
const RPC =
  process.env.RPC_URL ??
  (CHAIN === 998 ? "https://rpcs.chain.link/hyperevm/testnet" : "https://rpc.hyperliquid.xyz/evm");
const OPERATOR_FEE_BPS = Number(process.env.OPERATOR_FEE_BPS ?? "3000");

if (!process.env.PRIVATE_KEY) {
  throw new Error("Set PRIVATE_KEY or MAIN_PRIVATE_KEY in .env / .env.testnet / .env.mainnet");
}

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const depPath = path.join(root, "frontend/src/lib/contracts/deployments", `${CHAIN}.json`);
const deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
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
  id: CHAIN,
  name: CHAIN === 999 ? "HyperEVM" : "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });

const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
if (!vault) throw new Error("hyperpoolVault not in deployment JSON");

console.log("Syncing vaultShareHolders before harvest...");
await syncVaultShareHolders({
  root,
  chain: CHAIN,
  deployment,
  publicClient,
  vault,
  vaultAbi,
  extraAddresses: [account.address],
});
console.log(`  ${deployment.vaultShareHolders?.length ?? 0} holder(s) snapshotted`);

console.log("Harvesting fees from vault", vault);
const harvestHash = await walletClient.writeContract({
  address: vault,
  abi: vaultAbi,
  functionName: "harvestFees",
});
const harvestReceipt = await publicClient.waitForTransactionReceipt({ hash: harvestHash });
console.log("harvestFees tx", harvestReceipt.transactionHash);

const pending = await publicClient.readContract({
  address: vault,
  abi: vaultAbi,
  functionName: "pendingUserRewards",
});
console.log("pendingUserRewards (70% pool):", pending.toString());

if (pending === 0n) {
  console.log("No user rewards to distribute");
  process.exit(0);
}

if (!deployment.vaultShareHolders?.length) {
  throw new Error(
    "deployment.vaultShareHolders is required — snapshot vault shareholders before running daily-rewards"
  );
}

const holders = deployment.vaultShareHolders;
const eligibleShares = sumEligibleShares(holders);
if (eligibleShares === 0n) {
  throw new Error("No eligible vault shareholders with balance > 0");
}

const onChainSupply = await publicClient.readContract({
  address: vault,
  abi: vaultAbi,
  functionName: "totalSupply",
});
if (eligibleShares > onChainSupply) {
  throw new Error(
    `Eligible shares (${eligibleShares}) exceed totalSupply (${onChainSupply}) — re-run sync-shareholders`
  );
}

let referrers = new Map();
const registry = deployment.referralRegistry;
const ZERO = "0x0000000000000000000000000000000000000000";
if (registry && registry.toLowerCase() !== ZERO) {
  referrers = await fetchReferrerMap(publicClient, registry, holders);
  console.log(`Referral registry ${registry} — ${referrers.size} bound referee(s)`);
} else {
  console.log("Referral registry not configured — pro-rata Cashdrop only");
}

const rawEntries = buildCashdropEntries({
  holders: holders.map((h) => ({ address: h.address, shares: BigInt(h.shares) })),
  pending,
  totalShares: eligibleShares,
  referrers,
});

const holderInputs = holders.map((h) => ({ address: h.address, shares: BigInt(h.shares) }));
const entries = attachMinShares(rawEntries, holderInputs);

const allocated = entries.reduce((s, e) => s + e.amount, 0n);
if (allocated !== pending) {
  throw new Error(`Merkle entries sum ${allocated} != pending ${pending}`);
}

const merkleRoot = buildMerkleRoot(entries, true);

const jstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
const claimEnd = new Date(jstNow);
claimEnd.setHours(9, 0, 0, 0);
if (claimEnd <= jstNow) claimEnd.setDate(claimEnd.getDate() + 1);
const deadline = BigInt(Math.floor(claimEnd.getTime() / 1000));

const pullHash = await walletClient.writeContract({
  address: vault,
  abi: vaultAbi,
  functionName: "pullPendingRewards",
  args: [deployment.airdrop, pending],
});
await publicClient.waitForTransactionReceipt({ hash: pullHash });

const airdropBal = await publicClient.readContract({
  address: deployment.tokenUSDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [deployment.airdrop],
});
if (airdropBal < pending) {
  const fundHash = await walletClient.writeContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "fund",
    args: [pending - airdropBal],
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash });
}

const setHash = await walletClient.writeContract({
  address: deployment.airdrop,
  abi: airdropAbi,
  functionName: "setMerkleRoot",
  args: [merkleRoot, deadline],
});
await publicClient.waitForTransactionReceipt({ hash: setHash });

deployment.airdropEntries = entries.map((e) => ({
  address: e.address,
  amount: e.amount.toString(),
  minShares: e.minShares.toString(),
}));
deployment.merkleRoot = merkleRoot;
for (const p of [
  path.join(root, "contracts/deployments", `${CHAIN}.json`),
  path.join(root, "frontend/src/lib/contracts/deployments", `${CHAIN}.json`),
]) {
  if (fs.existsSync(path.dirname(p))) fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
}

console.log(`Merkle root set — ${entries.length} entries, deadline JST 9:00 (${deadline})`);
console.log(`Operator fee bps: ${OPERATOR_FEE_BPS} (30% default)`);
