/**
 * Time-weighted vault share balances (share-seconds) for fair Cashdrop allocation.
 * Logic mirrors frontend/src/lib/referral/timeWeighted.ts
 */
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { createPublicClientsForChain, getBlockWithRetry, rpcUrlsForChain, scanLogs, sleep } from "./rpc-logs.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { getAddress } = viem;

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

export function isEligibleShareholder(address) {
  const lower = address.toLowerCase();
  return lower !== ZERO && lower !== DEAD.toLowerCase();
}

function toBalanceMap(initial) {
  const balances = new Map();
  if (!initial) return balances;
  for (const [addr, bal] of Object.entries(initial)) {
    balances.set(addr.toLowerCase(), BigInt(bal));
  }
  return balances;
}

export function computeShareSecondsFromTransfers({
  periodStartTimestamp,
  periodEndTimestamp,
  initialBalances,
  transfers,
}) {
  const balances = toBalanceMap(initialBalances);
  const weighted = new Map();

  if (periodEndTimestamp < periodStartTimestamp) {
    throw new Error("periodEndTimestamp must be >= periodStartTimestamp");
  }

  let cursor = periodStartTimestamp;

  function accrueUntil(ts) {
    if (ts < cursor) return;
    const dt = BigInt(ts - cursor);
    if (dt === 0n) return;
    for (const [addr, bal] of balances) {
      if (bal > 0n && isEligibleShareholder(addr)) {
        const key = addr.toLowerCase();
        weighted.set(key, (weighted.get(key) ?? 0n) + bal * dt);
      }
    }
    cursor = ts;
  }

  const sorted = [...transfers].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });

  for (const transfer of sorted) {
    accrueUntil(transfer.timestamp);
    const from = transfer.from.toLowerCase();
    const to = transfer.to.toLowerCase();
    const value = transfer.value;
    if (isEligibleShareholder(from)) {
      balances.set(from, (balances.get(from) ?? 0n) - value);
    }
    if (isEligibleShareholder(to)) {
      balances.set(to, (balances.get(to) ?? 0n) + value);
    }
  }

  accrueUntil(periodEndTimestamp);

  return { weighted, endBalances: balances };
}

function balancesToCheckpointRecord(balances) {
  const out = {};
  for (const [addr, bal] of balances) {
    if (bal > 0n && isEligibleShareholder(addr)) out[getAddress(addr)] = bal.toString();
  }
  return out;
}

/**
 * Compute time-weighted holders for [checkpoint … harvestBlock].
 * Returns { holders: [{address, shares}], checkpoint, totalWeighted }.
 */
export async function computeTimeWeightedHolders({
  publicClient,
  vault,
  fromBlock,
  toBlock,
  periodStartTimestamp,
  periodEndTimestamp,
  initialBalances = {},
}) {
  const rpcClients = await createPublicClientsForChain(
    publicClient.chain,
    rpcUrlsForChain(publicClient.chain?.id ?? 999),
  );
  const logs = await scanLogs({
    publicClient,
    address: vault,
    event: transferEvent,
    fromBlock,
    toBlock,
    chunkSize: BigInt(process.env.LOG_CHUNK_SIZE ?? "100"),
    delayMs: Number(process.env.LOG_CHUNK_DELAY_MS ?? "1000"),
    rpcUrls: rpcUrlsForChain(publicClient.chain?.id ?? 999),
  });

  const blockTimestamps = new Map();
  async function timestampFor(blockNumber) {
    const key = blockNumber.toString();
    if (!blockTimestamps.has(key)) {
      await sleep(Number(process.env.BLOCK_READ_DELAY_MS ?? "80"));
      const block = await getBlockWithRetry({
        publicClient,
        clients: rpcClients,
        request: { blockNumber },
        label: `block:${key}`,
      });
      blockTimestamps.set(key, Number(block.timestamp));
    }
    return blockTimestamps.get(key);
  }

  const uniqueBlocks = [...new Set(logs.map((log) => log.blockNumber))].sort((a, b) =>
    a < b ? -1 : 1
  );
  console.log(`Prefetching timestamps for ${uniqueBlocks.length} block(s) (${logs.length} Transfer log(s))`);
  for (const blockNumber of uniqueBlocks) {
    await timestampFor(blockNumber);
  }

  const transfers = [];
  for (const log of logs) {
    transfers.push({
      from: log.args.from,
      to: log.args.to,
      value: log.args.value,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      timestamp: blockTimestamps.get(log.blockNumber.toString()),
    });
  }

  const { weighted, endBalances } = computeShareSecondsFromTransfers({
    periodStartTimestamp,
    periodEndTimestamp,
    initialBalances,
    transfers,
  });

  const holders = [...weighted.entries()]
    .filter(([, w]) => w > 0n)
    .map(([address, shares]) => ({ address: getAddress(address), shares: shares.toString() }))
    .sort((a, b) => a.address.localeCompare(b.address));

  const totalWeighted = holders.reduce((sum, h) => sum + BigInt(h.shares), 0n);

  return {
    holders,
    totalWeighted,
    checkpoint: {
      blockNumber: toBlock.toString(),
      timestamp: String(periodEndTimestamp),
      balances: balancesToCheckpointRecord(endBalances),
    },
  };
}

export function sumWeightedShares(holders) {
  return holders.reduce((sum, h) => sum + BigInt(h.shares), 0n);
}
