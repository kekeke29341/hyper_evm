#!/usr/bin/env node
/**
 * Mainnet Cashdrop smoke — run distributeRewards immediately (no JST 7:00 wait).
 *
 * When harvest yields 0 pendingUserRewards, funds the airdrop from the operator
 * wallet (POOL_USDC) to exercise the same auto-payout path as daily-rewards.mjs.
 *
 * Usage:
 *   source scripts/testnet-env.sh   # MAIN_PRIVATE_KEY = mainnet operator
 *   POOL_USDC=0.005 DEPLOYMENT_CHAIN=999 node scripts/mainnet-daily-rewards-smoke.mjs
 *
 * Env: PRIVATE_KEY / MAIN_PRIVATE_KEY, POOL_USDC (default 0.005), RUN_HARVEST=1 (default)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { buildCashdropEntries, fetchReferrerMap } from "./lib/referral-allocation.mjs";
import { sumEligibleShares, syncVaultShareHolders } from "./lib/sync-shareholders.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN = Number(process.env.DEPLOYMENT_CHAIN ?? "999");
const RPC = process.env.RPC_URL ?? "https://rpc.hyperliquid.xyz/evm";
const POOL_USDC = process.env.POOL_USDC ?? "0.005";
const RUN_HARVEST = process.env.RUN_HARVEST !== "0";
const SKIP_SYNC = process.env.SKIP_SYNC === "1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
if (!process.env.PRIVATE_KEY) {
  throw new Error("Set MAIN_PRIVATE_KEY or PRIVATE_KEY");
}

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { encodeAbiParameters, formatUnits, keccak256, parseUnits } = viem;
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
if (!vault) throw new Error("hyperpoolVault missing in deployment JSON");

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

console.log(`==> Mainnet Cashdrop smoke (chain ${CHAIN})`);

async function snapshotHoldersDirect() {
  const candidates = new Set([account.address.toLowerCase()]);
  for (const addr of (process.env.EXTRA_HOLDERS ?? "").split(",")) {
    if (addr.trim()) candidates.add(addr.trim().toLowerCase());
  }
  for (const h of deployment.vaultShareHolders ?? []) {
    if (h.address) candidates.add(h.address.toLowerCase());
  }

  const holders = [];
  for (const addr of candidates) {
    await sleep(800);
    const shares = await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "balanceOf",
      args: [addr],
    });
    if (shares > 0n) holders.push({ address: addr, shares: shares.toString() });
  }
  deployment.vaultShareHolders = holders;
  for (const p of [
    path.join(root, "contracts/deployments", `${CHAIN}.json`),
    path.join(root, "frontend/src/lib/contracts/deployments", `${CHAIN}.json`),
  ]) {
    if (fs.existsSync(p)) {
      const existing = JSON.parse(fs.readFileSync(p, "utf8"));
      existing.vaultShareHolders = holders;
      fs.writeFileSync(p, JSON.stringify(existing, null, 2) + "\n");
    }
  }
  return holders;
}

console.log(SKIP_SYNC ? "Snapshotting holders (SKIP_SYNC, no log scan)..." : "Syncing vaultShareHolders...");
const holders = SKIP_SYNC
  ? await snapshotHoldersDirect()
  : await syncVaultShareHolders({
      root,
      chain: CHAIN,
      deployment,
      publicClient,
      vault,
      vaultAbi,
      extraAddresses: [account.address],
    });
if (!holders.length) throw new Error("No vaultShareHolders — deposit to Vault first");
holders.forEach((h) => console.log(`    ${h.address}: ${h.shares} shares`));

const operatorBefore = await publicClient.readContract({
  address: deployment.tokenUSDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});

let pending = 0n;
if (RUN_HARVEST) {
  console.log("Running harvestFees (operator 33% sent immediately on non-zero fees)...");
  const harvestHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "harvestFees",
  });
  const harvestReceipt = await publicClient.waitForTransactionReceipt({ hash: harvestHash });
  console.log(`    harvestFees tx: ${harvestReceipt.transactionHash}`);
  pending = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pendingUserRewards",
  });
  console.log(`    pendingUserRewards after harvest: ${formatUnits(pending, 6)} USDC`);
}

const operatorAfterHarvest = await publicClient.readContract({
  address: deployment.tokenUSDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});
const operatorFeeDelta = operatorAfterHarvest - operatorBefore;
if (operatorFeeDelta > 0n) {
  console.log(`    operator USDC +${formatUnits(operatorFeeDelta, 6)} (33% fee share)`);
}

let smokeFunded = false;
let pool = pending;
if (pool === 0n) {
  pool = parseUnits(POOL_USDC, 6);
  smokeFunded = true;
  console.log(`No pending rewards — smoke fund ${POOL_USDC} USDC from operator wallet`);
  const walletUsdc = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (walletUsdc < pool) {
    throw new Error(`Need ${POOL_USDC} USDC in operator wallet, have ${formatUnits(walletUsdc, 6)}`);
  }
}

const eligibleShares = sumEligibleShares(holders);
if (eligibleShares === 0n) throw new Error("No eligible shares");

let referrers = new Map();
const registry = deployment.referralRegistry;
const ZERO = "0x0000000000000000000000000000000000000000";
if (registry && registry.toLowerCase() !== ZERO) {
  referrers = await fetchReferrerMap(publicClient, registry, holders);
}

const entries = buildCashdropEntries({
  holders: holders.map((h) => ({ address: h.address, shares: BigInt(h.shares) })),
  pending: pool,
  totalShares: eligibleShares,
  referrers,
});
if (!entries.length) throw new Error("No Cashdrop entries built");

const balancesBefore = new Map();
for (const entry of entries) {
  const bal = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [entry.address],
  });
  balancesBefore.set(entry.address.toLowerCase(), bal);
}

if (smokeFunded) {
  const appr = await walletClient.writeContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [deployment.airdrop, pool],
  });
  await publicClient.waitForTransactionReceipt({ hash: appr });
  const fundHash = await walletClient.writeContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "fund",
    args: [pool],
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash });
  console.log(`    funded MerkleAirdrop with ${POOL_USDC} USDC`);
} else {
  const pullHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pullPendingRewards",
    args: [deployment.airdrop, pool],
  });
  await publicClient.waitForTransactionReceipt({ hash: pullHash });
  console.log(`    pulled ${formatUnits(pool, 6)} USDC from vault to airdrop`);
}

const airdropBal = await publicClient.readContract({
  address: deployment.tokenUSDC,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [deployment.airdrop],
});
if (airdropBal < pool) {
  throw new Error(`Airdrop balance ${airdropBal} < pool ${pool}`);
}

const distributionId = distributionIdFor(entries, pending, 0n);
const already = await publicClient.readContract({
  address: deployment.airdrop,
  abi: airdropAbi,
  functionName: "distributionExecuted",
  args: [distributionId],
});
if (already) throw new Error(`Distribution ${distributionId} already executed`);

console.log("Calling distributeRewards (auto USDC payout)...");
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
console.log(`    distributeRewards tx: ${distributeReceipt.transactionHash}`);

let paidTotal = 0n;
for (const entry of entries) {
  const after = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [entry.address],
  });
  const before = balancesBefore.get(entry.address.toLowerCase()) ?? 0n;
  const delta = after - before;
  paidTotal += delta;
  console.log(`    ${entry.address}: +${formatUnits(delta, 6)} USDC`);
}

if (paidTotal === 0n) throw new Error("No USDC was credited to recipients");

deployment.airdropEntries = entries.map((e) => ({
  address: e.address,
  amount: e.amount.toString(),
  minShares: e.minShares?.toString(),
}));
deployment.lastCashdropDistribution = {
  distributionId,
  txHash: distributeReceipt.transactionHash,
  amount: pool.toString(),
  entries: entries.length,
  executedAt: new Date().toISOString(),
  smokeFunded,
};
delete deployment.merkleRoot;

for (const p of [
  path.join(root, "contracts/deployments", `${CHAIN}.json`),
  path.join(root, "frontend/src/lib/contracts/deployments", `${CHAIN}.json`),
]) {
  if (fs.existsSync(path.dirname(p))) fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
}

console.log(`==> Smoke OK — ${entries.length} recipient(s), ${formatUnits(paidTotal, 6)} USDC paid`);
if (smokeFunded) {
  console.log("    (Used operator-funded pool — real LP fees still require pool trading volume)");
}
