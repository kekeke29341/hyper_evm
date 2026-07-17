#!/usr/bin/env node
/**
 * Daily fee harvest: collect Project X fees → 7% ops / 60% user auto payout / 33% owner.
 * Schedule: JST 07:00 harvest, 08:00 distribute (use cron TZ=Asia/Tokyo)
 *
 * Env: PRIVATE_KEY, RPC_URL (999), DEPLOYMENT_CHAIN=999
 *      DAILY_REWARDS_PHASE=harvest|distribute|all (default all)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { buildCashdropEntries, fetchReferrerMap } from "./lib/referral-allocation.mjs";
import {
  checkpointFromHolders,
  clearPendingCashdrop,
  readPendingCashdrop,
  writePendingCashdrop,
} from "./lib/cashdrop-checkpoint.mjs";
import {
  assertShareholderSyncComplete,
  sumEligibleShares,
  syncVaultShareHolders,
} from "./lib/sync-shareholders.mjs";
import {
  computeTimeWeightedHolders,
} from "./lib/time-weighted-shares.mjs";
import {
  createPublicClientsForChain,
  getBlockWithRetry,
  parseExtraAddresses,
  readContractWithRetry,
  rpcUrlsForChain,
} from "./lib/rpc-logs.mjs";

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
if (CHAIN === 999 && process.env.SKIP_LOG_SCAN === undefined) {
  process.env.SKIP_LOG_SCAN = "1";
}
const RPC =
  process.env.RPC_URL ??
  rpcUrlsForChain(CHAIN)[0] ??
  (CHAIN === 998 ? "https://rpcs.chain.link/hyperevm/testnet" : "https://rpc.hyperliquid.xyz/evm");
const OPERATIONS_FEE_BPS = Number(process.env.OPERATIONS_FEE_BPS ?? process.env.OPERATOR_FEE_BPS ?? "700");
const OWNER_FEE_BPS = Number(process.env.OWNER_FEE_BPS ?? "3300");
const USER_FEE_BPS = 10_000 - OPERATIONS_FEE_BPS - OWNER_FEE_BPS;
const ZERO_ROOT = `0x${"0".repeat(64)}`;
const TIME_WEIGHTED_CASHDROP = process.env.TIME_WEIGHTED_CASHDROP !== "0";
const DAILY_REWARDS_PHASE = (process.env.DAILY_REWARDS_PHASE ?? "all").toLowerCase();

function vaultDeployBlock(deployment) {
  if (process.env.DEPLOY_BLOCK) return BigInt(process.env.DEPLOY_BLOCK);
  if (deployment.vaultDeployBlock) return BigInt(deployment.vaultDeployBlock);
  if (CHAIN === 999) return 39_115_156n;
  return 0n;
}

async function resolveWeightingPeriod(publicClient) {
  const checkpoint = deployment.cashdropWeightCheckpoint;
  if (checkpoint?.blockNumber && checkpoint?.timestamp) {
    return {
      fromBlock: BigInt(checkpoint.blockNumber) + 1n,
      periodStartTimestamp: Number(checkpoint.timestamp),
      initialBalances: checkpoint.balances ?? {},
    };
  }

  const last = deployment.lastCashdropDistribution;
  if (last?.harvestBlock && last?.harvestTimestamp) {
    return {
      fromBlock: BigInt(last.harvestBlock) + 1n,
      periodStartTimestamp: Number(last.harvestTimestamp),
      initialBalances: checkpoint?.balances ?? {},
    };
  }
  if (last?.executedAt) {
    return {
      fromBlock: vaultDeployBlock(deployment),
      periodStartTimestamp: Math.floor(Date.parse(last.executedAt) / 1000),
      initialBalances: {},
    };
  }

  const fromBlock = vaultDeployBlock(deployment);
  const startBlock = await getBlock({ blockNumber: fromBlock }, `startBlock:${fromBlock}`);
  return {
    fromBlock,
    periodStartTimestamp: Number(startBlock.timestamp),
    initialBalances: {},
  };
}

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
const rpcClients = await createPublicClientsForChain(chain, rpcUrlsForChain(CHAIN));

function readContract(request, label) {
  return readContractWithRetry({ publicClient, clients: rpcClients, request, label });
}

function getBlock(request, label) {
  return getBlockWithRetry({ publicClient, clients: rpcClients, request, label });
}

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
  const currentRoot = await readContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "merkleRoot",
  }, "airdrop.merkleRoot");
  const currentDeadline = await readContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "claimDeadline",
  }, "airdrop.claimDeadline");

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
    const claimed = await readContract({
      address: deployment.airdrop,
      abi: airdropAbi,
      functionName: "claimedByRoot",
      args: [currentRoot, entry.address],
    }, `claimedByRoot:${entry.address}`);
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

function saveDeploymentJson() {
  for (const p of [
    path.join(root, "contracts/deployments", `${CHAIN}.json`),
    path.join(root, "frontend/src/lib/contracts/deployments", `${CHAIN}.json`),
  ]) {
    if (fs.existsSync(path.dirname(p))) fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
  }
}

async function runHarvestPhase() {
  console.log(`==> Daily rewards phase: harvest (chain ${CHAIN})`);
  console.log("Syncing vaultShareHolders before harvest...");
  const extraHolders = parseExtraAddresses(account.address, process.env.EXTRA_HOLDERS);
  const syncOptions = {
    root,
    chain: CHAIN,
    deployment,
    publicClient,
    vault,
    vaultAbi,
    extraAddresses: extraHolders,
  };
  await syncVaultShareHolders(syncOptions);
  let holders = deployment.vaultShareHolders ?? [];
  console.log(`  ${holders.length} holder(s) snapshotted`);
  for (const h of holders) {
    console.log(`    ${h.address}: ${h.shares} shares`);
  }
  try {
    await assertShareholderSyncComplete({ publicClient, vault, vaultAbi, holders });
  } catch (err) {
    // A depositor unknown to the deployment JSON (e.g. a brand-new customer)
    // is invisible to the balanceOf-only fast path. Fall back to an
    // incremental Transfer log scan since the last checkpoint to find them.
    if (process.env.SKIP_LOG_SCAN !== "1") throw err;
    console.warn(`Shareholder coverage incomplete (${err?.message ?? err})`);
    console.warn("Falling back to incremental Transfer log scan to discover new holders...");
    process.env.SKIP_LOG_SCAN = "0";
    try {
      await syncVaultShareHolders(syncOptions);
    } finally {
      process.env.SKIP_LOG_SCAN = "1";
    }
    holders = deployment.vaultShareHolders ?? [];
    console.log(`  ${holders.length} holder(s) after log scan`);
    for (const h of holders) {
      console.log(`    ${h.address}: ${h.shares} shares`);
    }
    await assertShareholderSyncComplete({ publicClient, vault, vaultAbi, holders });
  }

  try {
    const deployHash = await walletClient.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "deployIdle",
    });
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    console.log("deployIdle before harvest tx", deployReceipt.transactionHash);
  } catch (err) {
    const msg = err?.shortMessage ?? err?.message ?? String(err);
    console.warn("deployIdle before harvest skipped:", msg);
  }

  console.log("Harvesting fees from vault", vault);
  const harvestHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "harvestFees",
  });
  const harvestReceipt = await publicClient.waitForTransactionReceipt({ hash: harvestHash });
  console.log("harvestFees tx", harvestReceipt.transactionHash);

  const pending = await readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pendingUserRewards",
  }, "vault.pendingUserRewards");
  console.log("pendingUserRewards (60% pool):", pending.toString());

  const carryoverEntries = await collectCarryoverEntries();
  const carryover = carryoverEntries.reduce((sum, entry) => sum + entry.amount, 0n);
  console.log("carryover from previous unclaimed Cashdrop:", carryover.toString());

  if (pending === 0n && carryover === 0n) {
    console.log("No user rewards or carryover to distribute");
    clearPendingCashdrop(root, CHAIN);
    return null;
  }

  const harvestBlockData = await getBlock(
    { blockNumber: harvestReceipt.blockNumber },
    `harvestBlock:${harvestReceipt.blockNumber}`
  );

  const pendingState = {
    vault,
    harvestTxHash: harvestReceipt.transactionHash,
    harvestBlock: harvestReceipt.blockNumber.toString(),
    harvestTimestamp: String(harvestBlockData.timestamp),
    pending: pending.toString(),
    holders,
    createdAt: new Date().toISOString(),
  };
  writePendingCashdrop(root, CHAIN, pendingState);
  console.log("Wrote pending Cashdrop state for distribute phase");
  return pendingState;
}

async function runDistributePhase(pendingState) {
  console.log(`==> Daily rewards phase: distribute (chain ${CHAIN})`);

  let harvestReceipt;
  let pending;
  let holders;
  let harvestTimestamp;

  if (pendingState) {
    harvestReceipt = {
      transactionHash: pendingState.harvestTxHash,
      blockNumber: BigInt(pendingState.harvestBlock),
    };
    pending = BigInt(pendingState.pending);
    holders = pendingState.holders ?? [];
    harvestTimestamp = Number(pendingState.harvestTimestamp);
  } else {
    const saved = readPendingCashdrop(root, CHAIN);
    if (!saved) {
      console.log("No pending harvest state — skipping distribute phase");
      return;
    }
    if (saved.vault?.toLowerCase() !== vault.toLowerCase()) {
      throw new Error(`Pending state vault ${saved.vault} != deployment vault ${vault}`);
    }
    harvestReceipt = {
      transactionHash: saved.harvestTxHash,
      blockNumber: BigInt(saved.harvestBlock),
    };
    pending = BigInt(saved.pending);
    holders = saved.holders ?? [];
    harvestTimestamp = Number(saved.harvestTimestamp);
    console.log(`Loaded pending harvest from ${saved.createdAt} (tx ${saved.harvestTxHash})`);
  }

  const carryoverEntries = await collectCarryoverEntries();
  const carryover = carryoverEntries.reduce((sum, entry) => sum + entry.amount, 0n);
  console.log("carryover from previous unclaimed Cashdrop:", carryover.toString());

  if (pending === 0n && carryover === 0n) {
    console.log("No user rewards or carryover to distribute");
    clearPendingCashdrop(root, CHAIN);
    return;
  }

  if (pending > 0n && !holders.length) {
    throw new Error(
      "deployment.vaultShareHolders is required — snapshot vault shareholders before running daily-rewards"
    );
  }

  const eligibleShares = sumEligibleShares(holders ?? []);
  if (pending > 0n && eligibleShares === 0n) {
    throw new Error("No eligible vault shareholders with balance > 0");
  }

  let allocationHolders = holders;
  let allocationTotal = eligibleShares;

  let useTimeWeighted = TIME_WEIGHTED_CASHDROP;
  if (pending > 0n && useTimeWeighted && !deployment.cashdropWeightCheckpoint?.blockNumber && holders.length > 0) {
    console.log(
      "No cashdropWeightCheckpoint — using harvest shareholder snapshot (skipping full-period log scan)"
    );
    useTimeWeighted = false;
  }

  if (pending > 0n && useTimeWeighted) {
    const harvestBlock = harvestReceipt.blockNumber;
    const period = await resolveWeightingPeriod(publicClient);
    const weighted = await computeTimeWeightedHolders({
      publicClient,
      vault,
      fromBlock: period.fromBlock,
      toBlock: harvestBlock,
      periodStartTimestamp: period.periodStartTimestamp,
      periodEndTimestamp: harvestTimestamp,
      initialBalances: period.initialBalances,
    });

    if (weighted.totalWeighted === 0n) {
      throw new Error(
        "Time-weighted share-seconds is zero for this period — no eligible vault participation"
      );
    }

    allocationHolders = weighted.holders;
    allocationTotal = weighted.totalWeighted;
    deployment.cashdropWeightCheckpoint = weighted.checkpoint;

    console.log(`Time-weighted Cashdrop (${weighted.holders.length} participant(s)):`);
    for (const h of weighted.holders) {
      const pct = Number((BigInt(h.shares) * 10000n) / weighted.totalWeighted) / 100;
      console.log(`    ${h.address}: ${h.shares} share-seconds (${pct.toFixed(2)}%)`);
    }
  } else if (pending > 0n) {
    console.log("Using end-of-period snapshot shares (no time-weighted log scan)");
    deployment.cashdropWeightCheckpoint = checkpointFromHolders(
      holders,
      harvestReceipt.blockNumber,
      harvestTimestamp
    );
  }

  if (pending > 0n) {
    const onChainSupply = await readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "totalSupply",
    }, "vault.totalSupply");
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
    referrers = await fetchReferrerMap(publicClient, registry, allocationHolders, rpcClients);
    console.log(`Referral registry ${registry} — ${referrers.size} bound referee(s)`);
  } else if (pending > 0n) {
    console.log("Referral registry not configured — pro-rata Cashdrop only");
  }

  const currentEntries =
    pending > 0n
      ? buildCashdropEntries({
          holders: allocationHolders.map((h) => ({ address: h.address, shares: BigInt(h.shares) })),
          pending,
          totalShares: allocationTotal,
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

  const airdropBal = await readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [deployment.airdrop],
  }, "airdrop.usdcBalance");
  if (airdropBal < totalDistribution) {
    throw new Error(
      `MerkleAirdrop balance ${airdropBal} is lower than auto distribution ${totalDistribution}`
    );
  }

  const distributionId = distributionIdFor(entries, pending, carryover);
  const distributed = await readContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "distributionExecuted",
    args: [distributionId],
  }, "airdrop.distributionExecuted");
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
    harvestBlock: harvestReceipt.blockNumber.toString(),
    harvestTimestamp: String(harvestTimestamp),
    timeWeighted: useTimeWeighted,
  };
  delete deployment.merkleRoot;
  saveDeploymentJson();
  clearPendingCashdrop(root, CHAIN);

  console.log(
    `Auto Cashdrop distributed — ${entries.length} entries, ${totalDistribution} USDC units, tx ${distributeReceipt.transactionHash}`
  );
  console.log(
    `Fee split bps — ops: ${OPERATIONS_FEE_BPS} (7%), user: ${USER_FEE_BPS} (60%), owner: ${OWNER_FEE_BPS} (33%)`
  );
}

if (!["all", "harvest", "distribute"].includes(DAILY_REWARDS_PHASE)) {
  throw new Error(`Invalid DAILY_REWARDS_PHASE=${DAILY_REWARDS_PHASE} (use harvest|distribute|all)`);
}

let pendingState = null;
if (DAILY_REWARDS_PHASE === "harvest" || DAILY_REWARDS_PHASE === "all") {
  pendingState = await runHarvestPhase();
}
if (DAILY_REWARDS_PHASE === "distribute" || DAILY_REWARDS_PHASE === "all") {
  await runDistributePhase(DAILY_REWARDS_PHASE === "all" ? pendingState : null);
}
