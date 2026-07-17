/**
 * Sync vaultShareHolders from on-chain Transfer events + balanceOf into deployment JSON files.
 */
import fs from "fs";
import path from "path";

import {
  createPublicClientsForChain,
  parseExtraAddresses,
  readContractWithRetry,
  rpcUrlsForChain,
  scanLogs,
  sleep,
} from "./rpc-logs.mjs";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
};

function isExcludedHolder(address) {
  const lower = address.toLowerCase();
  return lower === ZERO || lower === DEAD.toLowerCase();
}

function deployFromBlock(chain, deployment) {
  if (process.env.DEPLOY_BLOCK) return BigInt(process.env.DEPLOY_BLOCK);
  if (deployment.vaultDeployBlock) return BigInt(deployment.vaultDeployBlock);
  // HyperEVM mainnet vault redeploy (2026-06-29) — avoids scanning from genesis.
  if (chain === 999) return 39_115_156n;
  return 0n;
}

/**
 * Start block for incremental Transfer log scans (checkpoint or last harvest + 1).
 */
export function incrementalLogFromBlock(chain, deployment) {
  if (process.env.SKIP_LOG_SCAN === "1") {
    console.log("SKIP_LOG_SCAN=1 — using deployment JSON holders + balanceOf only");
    return deployFromBlock(chain, deployment);
  }
  const checkpoint = deployment.cashdropWeightCheckpoint;
  if (checkpoint?.blockNumber) {
    const from = BigInt(checkpoint.blockNumber) + 1n;
    console.log(`Incremental log scan from checkpoint block ${from}`);
    return from;
  }
  const last = deployment.lastCashdropDistribution;
  if (last?.harvestBlock) {
    const from = BigInt(last.harvestBlock) + 1n;
    console.log(`Incremental log scan from last harvest block ${from}`);
    return from;
  }
  const from = deployFromBlock(chain, deployment);
  console.log(`Full log scan from vault deploy block ${from}`);
  return from;
}

/** Discover shareholder addresses from vault Transfer logs. */
export async function discoverVaultShareholderAddresses({
  publicClient,
  vault,
  fromBlock = 0n,
  extraAddresses = [],
  chunkSize = 200n,
  delayMs = 400,
}) {
  const addresses = new Set(extraAddresses.filter(Boolean).map((a) => a.toLowerCase()));

  const latest = await publicClient.getBlockNumber();
  let start = fromBlock;
  if (start === 0n) {
    const lookback = BigInt(process.env.SHAREHOLDER_LOOKBACK_BLOCKS ?? "50000");
    start = latest > lookback ? latest - lookback : 0n;
  }

  const skipLogScan = process.env.SKIP_LOG_SCAN === "1";
  if (!skipLogScan) {
    const chainId = publicClient.chain?.id;
    const logs = await scanLogs({
      publicClient,
      address: vault,
      event: transferEvent,
      fromBlock: start,
      toBlock: latest,
      chunkSize: BigInt(process.env.LOG_CHUNK_SIZE ?? String(chunkSize)),
      delayMs: Number(process.env.LOG_CHUNK_DELAY_MS ?? delayMs),
      rpcUrls: rpcUrlsForChain(chainId ?? 999),
    });

    for (const log of logs) {
      const from = log.args?.from;
      const to = log.args?.to;
      if (from && !isExcludedHolder(from)) addresses.add(from.toLowerCase());
      if (to && !isExcludedHolder(to)) addresses.add(to.toLowerCase());
    }
  } else {
    console.log("SKIP_LOG_SCAN=1 — using seed addresses + balanceOf only");
  }

  return [...addresses];
}

export async function syncVaultShareHolders({
  root,
  chain,
  deployment,
  publicClient,
  vault,
  vaultAbi,
  extraAddresses = [],
  fromBlock,
}) {
  const rpcClients = await createPublicClientsForChain(publicClient.chain, rpcUrlsForChain(chain));
  const seed = parseExtraAddresses(
    extraAddresses,
    process.env.EXTRA_HOLDERS,
    ...(deployment.vaultShareHolders ?? []).map((h) => h.address)
  );

  const discovered = await discoverVaultShareholderAddresses({
    publicClient,
    vault,
    fromBlock: fromBlock ?? incrementalLogFromBlock(chain, deployment),
    extraAddresses: seed,
  });

  const holders = [];
  for (const address of discovered) {
    if (isExcludedHolder(address)) continue;
    await sleep(Number(process.env.BALANCE_READ_DELAY_MS ?? "120"));
    const shares = await readContractWithRetry({
      publicClient,
      clients: rpcClients,
      label: `balanceOf:${address}`,
      request: {
        address: vault,
        abi: vaultAbi,
        functionName: "balanceOf",
        args: [address],
      },
    });
    if (shares > 0n) holders.push({ address, shares: shares.toString() });
  }

  holders.sort((a, b) => a.address.localeCompare(b.address));
  deployment.vaultShareHolders = holders;

  for (const p of [
    path.join(root, "contracts/deployments", `${chain}.json`),
    path.join(root, "frontend/src/lib/contracts/deployments", `${chain}.json`),
  ]) {
    if (fs.existsSync(path.dirname(p))) {
      fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
    }
  }

  return holders;
}

/** Sum of eligible shareholder balances (excludes dead shares). */
export function sumEligibleShares(holders) {
  return holders.reduce((sum, h) => sum + BigInt(h.shares), 0n);
}

/**
 * Fail fast when log scan missed holders (eligible << totalSupply - DEAD lock).
 * Prevents paying 100% to a stale single address in deployment JSON.
 */
export async function assertShareholderSyncComplete({
  publicClient,
  vault,
  vaultAbi,
  holders,
}) {
  const rpcClients = await createPublicClientsForChain(publicClient.chain, rpcUrlsForChain(publicClient.chain?.id ?? 999));
  const [totalSupply, deadShares] = await Promise.all([
    readContractWithRetry({
      publicClient,
      clients: rpcClients,
      label: "totalSupply",
      request: {
      address: vault,
      abi: vaultAbi,
      functionName: "totalSupply",
      },
    }),
    readContractWithRetry({
      publicClient,
      clients: rpcClients,
      label: "deadShares",
      request: {
      address: vault,
      abi: vaultAbi,
      functionName: "balanceOf",
      args: [DEAD],
      },
    }),
  ]);

  const eligible = sumEligibleShares(holders);
  const expectedMin = totalSupply > deadShares ? totalSupply - deadShares : totalSupply;
  const minBps = Number(process.env.SHAREHOLDER_MIN_COVERAGE_BPS ?? "9900");
  const threshold = (expectedMin * BigInt(minBps)) / 10_000n;

  if (eligible < threshold) {
    throw new Error(
      `Shareholder sync incomplete: eligible shares ${eligible} < ${threshold} ` +
        `(totalSupply ${totalSupply}, dead ${deadShares}). ` +
        `Re-run with LOG_CHUNK_DELAY_MS=600 or DEPLOY_BLOCK set; check EXTRA_HOLDERS.`
    );
  }

  return { totalSupply, eligible, deadShares };
}
