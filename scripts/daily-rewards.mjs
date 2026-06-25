#!/usr/bin/env node
/**
 * Daily fee harvest: collect Project X fees → 33% operator / 67% auto-paid USDC.
 * Schedule: JST 07:00 (use cron TZ=Asia/Tokyo)
 *
 * Env: PRIVATE_KEY, RPC_URL (999), OPERATOR_WALLET, DEPLOYMENT_CHAIN=999
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

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
const OPERATOR_FEE_BPS = Number(process.env.OPERATOR_FEE_BPS ?? "3300");
const ZERO_ROOT = `0x${"0".repeat(64)}`;

if (!process.env.PRIVATE_KEY) {
  throw new Error("Set PRIVATE_KEY or MAIN_PRIVATE_KEY in .env / .env.testnet / .env.mainnet");
}

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { encodeAbiParameters, keccak256 } = viem;
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

function addCombinedEntry(map, entry) {
  const key = entry.address.toLowerCase();
  const prev = map.get(key);
  const amount = BigInt(entry.amount);
  const minShares = BigInt(entry.minShares ?? 1n);
  if (!prev) {
    map.set(key, { address: entry.address, amount, minShares });
    return;
  }
  map.set(key, {
    address: prev.address,
    amount: prev.amount + amount,
    minShares: prev.minShares > minShares ? prev.minShares : minShares,
  });
}

function mergeCashdropEntries(...groups) {
  const combined = new Map();
  for (const entries of groups) {
    for (const entry of entries) addCombinedEntry(combined, entry);
  }
  return [...combined.values()]
    .filter((entry) => entry.amount > 0n)
    .sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
}

function distributionIdFor(entries, pending, carryover) {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "chainId", type: "uint256" },
        { name: "vault", type: "address" },
        { name: "airdrop", type: "address" },
        { name: "pending", type: "uint256" },
        { name: "carryover", type: "uint256" },
        { name: "accounts", type: "address[]" },
        { name: "amounts", type: "uint256[]" },
      ],
      [
        BigInt(CHAIN),
        vault,
        deployment.airdrop,
        pending,
        carryover,
        entries.map((entry) => entry.address),
        entries.map((entry) => entry.amount),
      ]
    )
  );
}

async function collectCarryoverEntries() {
  const currentRoot = await publicClient.readContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "merkleRoot",
  });
  const currentDeadline = await publicClient.readContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "claimDeadline",
  });

  const previousEntries = deployment.airdropEntries ?? [];
  if (
    !previousEntries.length ||
    !deployment.merkleRoot ||
    !currentRoot ||
    currentRoot.toLowerCase() === ZERO_ROOT
  ) {
    return [];
  }

  if (deployment.merkleRoot.toLowerCase() !== currentRoot.toLowerCase()) {
    throw new Error(
      `Deployment merkleRoot ${deployment.merkleRoot} does not match on-chain root ${currentRoot}; refusing to guess carryover`
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (currentDeadline > now) {
    throw new Error(
      `Current Cashdrop root is still claimable until ${currentDeadline}; wait until it expires before rolling carryover`
    );
  }

  const carryover = [];
  for (const entry of previousEntries) {
    const claimed = await publicClient.readContract({
      address: deployment.airdrop,
      abi: airdropAbi,
      functionName: "claimedByRoot",
      args: [currentRoot, entry.address],
    });
    if (!claimed) {
      carryover.push({
        address: entry.address,
        amount: BigInt(entry.amount),
        minShares: BigInt(entry.minShares ?? 1),
      });
    }
  }
  return carryover;
}

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
console.log("pendingUserRewards (67% pool):", pending.toString());

const carryoverEntries = await collectCarryoverEntries();
const carryover = carryoverEntries.reduce((sum, entry) => sum + entry.amount, 0n);
console.log("carryover from previous unclaimed Cashdrop:", carryover.toString());

if (pending === 0n && carryover === 0n) {
  console.log("No user rewards or carryover to distribute");
  process.exit(0);
}

if (pending > 0n && !deployment.vaultShareHolders?.length) {
  throw new Error(
    "deployment.vaultShareHolders is required — snapshot vault shareholders before running daily-rewards"
  );
}

const holders = deployment.vaultShareHolders;
const eligibleShares = sumEligibleShares(holders ?? []);
if (pending > 0n && eligibleShares === 0n) {
  throw new Error("No eligible vault shareholders with balance > 0");
}

if (pending > 0n) {
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
}

let referrers = new Map();
const registry = deployment.referralRegistry;
const ZERO = "0x0000000000000000000000000000000000000000";
if (pending > 0n && registry && registry.toLowerCase() !== ZERO) {
  referrers = await fetchReferrerMap(publicClient, registry, holders);
  console.log(`Referral registry ${registry} — ${referrers.size} bound referee(s)`);
} else if (pending > 0n) {
  console.log("Referral registry not configured — pro-rata Cashdrop only");
}

const currentEntries =
  pending > 0n
    ? buildCashdropEntries({
        holders: holders.map((h) => ({ address: h.address, shares: BigInt(h.shares) })),
        pending,
        totalShares: eligibleShares,
        referrers,
      })
    : [];

const entries = mergeCashdropEntries(currentEntries, carryoverEntries);

const allocated = currentEntries.reduce((s, e) => s + e.amount, 0n);
if (allocated !== pending) {
  throw new Error(`Merkle entries sum ${allocated} != pending ${pending}`);
}
const totalDistribution = pending + carryover;
const combinedAllocated = entries.reduce((s, e) => s + e.amount, 0n);
if (combinedAllocated !== totalDistribution) {
  throw new Error(`Combined Merkle entries sum ${combinedAllocated} != distribution ${totalDistribution}`);
}

if (pending > 0n) {
  const pullHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pullPendingRewards",
    args: [deployment.airdrop, pending],
  });
  await publicClient.waitForTransactionReceipt({ hash: pullHash });
}

const airdropBal = await publicClient.readContract({
  address: deployment.tokenUSDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [deployment.airdrop],
});
if (airdropBal < totalDistribution) {
  throw new Error(
    `MerkleAirdrop balance ${airdropBal} is lower than auto distribution ${totalDistribution}`
  );
}

const distributionId = distributionIdFor(entries, pending, carryover);
const distributed = await publicClient.readContract({
  address: deployment.airdrop,
  abi: airdropAbi,
  functionName: "distributionExecuted",
  args: [distributionId],
});
if (distributed) {
  throw new Error(`Distribution ${distributionId} was already executed`);
}

const distributeHash = await walletClient.writeContract({
  address: deployment.airdrop,
  abi: airdropAbi,
  functionName: "distributeRewards",
  args: [
    distributionId,
    entries.map((entry) => entry.address),
    entries.map((entry) => entry.amount),
  ],
});
const distributeReceipt = await publicClient.waitForTransactionReceipt({ hash: distributeHash });

deployment.airdropEntries = entries.map((e) => ({
  address: e.address,
  amount: e.amount.toString(),
  minShares: e.minShares?.toString(),
}));
deployment.lastCashdropDistribution = {
  distributionId,
  txHash: distributeReceipt.transactionHash,
  amount: totalDistribution.toString(),
  entries: entries.length,
  executedAt: new Date().toISOString(),
};
delete deployment.merkleRoot;
for (const p of [
  path.join(root, "contracts/deployments", `${CHAIN}.json`),
  path.join(root, "frontend/src/lib/contracts/deployments", `${CHAIN}.json`),
]) {
  if (fs.existsSync(path.dirname(p))) fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
}

console.log(
  `Auto Cashdrop distributed — ${entries.length} entries, ${totalDistribution} USDC units, tx ${distributeReceipt.transactionHash}`
);
console.log(`Operator fee bps: ${OPERATOR_FEE_BPS} (33% default)`);
