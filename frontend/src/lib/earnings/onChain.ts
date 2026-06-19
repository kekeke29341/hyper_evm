import {
  formatUnits,
  parseAbiItem,
  type Address,
  type Log,
  type PublicClient,
} from "viem";
import type { EarningsClaim } from "./history";

/** Chains where Cashdrop Claimed events are indexed for earnings history */
export const ON_CHAIN_EARNINGS_CHAIN_IDS = new Set([998, 31337]);

export const claimedEvent = parseAbiItem(
  "event Claimed(address indexed account, uint256 amount)"
);

type ClaimedLog = Log<bigint, number, false, typeof claimedEvent>;

type LogScanPlan = { chunk: bigint; maxLookback: bigint; fastWindows: bigint[] };

const LOG_SCAN_BY_CHAIN: Partial<Record<number, LogScanPlan>> = {
  // Chainlink testnet RPC rejects ranges > ~1k blocks — paginate in small chunks.
  998: { chunk: 1_000n, maxLookback: 200_000n, fastWindows: [10_000n, 5_000n, 2_000n] },
  999: { chunk: 1_000n, maxLookback: 200_000n, fastWindows: [10_000n, 5_000n, 2_000n] },
};

const DEFAULT_LOG_SCAN: LogScanPlan = {
  chunk: 5_000n,
  maxLookback: 50_000n,
  fastWindows: [20_000n, 5_000n],
};

export function logScanPlan(chainId: number): LogScanPlan {
  return LOG_SCAN_BY_CHAIN[chainId] ?? DEFAULT_LOG_SCAN;
}

/** Block ranges scanned newest-first for eth_getLogs pagination. */
export function logScanRanges(
  latest: bigint,
  plan: LogScanPlan
): Array<{ fromBlock: bigint; toBlock: bigint }> {
  const minBlock = latest > plan.maxLookback ? latest - plan.maxLookback : 0n;
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];

  let toBlock = latest;
  while (toBlock >= minBlock) {
    const fromBlock = toBlock >= plan.chunk ? toBlock - plan.chunk + 1n : minBlock;
    const clampedFrom = fromBlock < minBlock ? minBlock : fromBlock;
    ranges.push({ fromBlock: clampedFrom, toBlock });
    if (clampedFrom <= minBlock) break;
    toBlock = clampedFrom - 1n;
  }

  return ranges;
}

async function getClaimedLogsInRange(
  publicClient: PublicClient,
  airdropAddress: Address,
  account: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<ClaimedLog[]> {
  return publicClient.getLogs({
    address: airdropAddress,
    event: claimedEvent,
    args: { account },
    fromBlock,
    toBlock,
    strict: true,
  });
}

function dedupeLogs(logs: ClaimedLog[]) {
  const seen = new Set<string>();
  const out: ClaimedLog[] = [];
  for (const log of logs) {
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(log);
  }
  return out;
}

async function fetchClaimedLogs(
  publicClient: PublicClient,
  airdropAddress: Address,
  account: Address,
  chainId: number
) {
  const latest = await publicClient.getBlockNumber();
  const plan = logScanPlan(chainId);

  for (const window of plan.fastWindows) {
    const fromBlock = latest > window ? latest - window : 0n;
    try {
      const logs = await getClaimedLogsInRange(
        publicClient,
        airdropAddress,
        account,
        fromBlock,
        latest
      );
      if (logs.length > 0) return logs;
    } catch {
      // RPC may reject wide eth_getLogs ranges — fall through to chunked scan.
    }
  }

  const collected: ClaimedLog[] = [];
  for (const { fromBlock, toBlock } of logScanRanges(latest, plan)) {
    try {
      const batch = await getClaimedLogsInRange(
        publicClient,
        airdropAddress,
        account,
        fromBlock,
        toBlock
      );
      collected.push(...batch);
    } catch {
      // Skip unreadable ranges; partial history is better than none.
    }
  }

  return dedupeLogs(collected);
}

export async function fetchOnChainEarningsClaims(
  publicClient: PublicClient,
  airdropAddress: Address,
  account: Address,
  chainId: number
): Promise<EarningsClaim[]> {
  const logs = await fetchClaimedLogs(publicClient, airdropAddress, account, chainId);
  const blockTs = new Map<bigint, number>();
  const claims: EarningsClaim[] = [];

  for (const log of logs) {
    const amount = log.args?.amount;
    if (amount == null || log.blockNumber == null) continue;

    let tsSec = blockTs.get(log.blockNumber);
    if (tsSec === undefined) {
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      tsSec = Number(block.timestamp);
      blockTs.set(log.blockNumber, tsSec);
    }

    claims.push({
      t: tsSec * 1000,
      usdc: parseFloat(formatUnits(amount, 6)),
      txHash: log.transactionHash ?? undefined,
    });
  }

  claims.sort((a, b) => a.t - b.t);
  return claims;
}
