"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
  createPublicClient,
  http,
  formatUnits,
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem";
import { getDeployment, getVaultAddress } from "@/lib/contracts";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";

export type ActivityKind = "deposit" | "withdraw" | "harvest" | "payout";

export type ActivityItem = {
  kind: ActivityKind;
  /** User wallet for deposit/withdraw/payout; undefined for harvest */
  account?: Address;
  usdc?: number;
  hype?: number;
  txHash: string;
  blockNumber: bigint;
  /** Unix ms; 0 when the block timestamp could not be resolved */
  timestamp: number;
};

export type ActivitySummary = {
  depositUsdc: number;
  depositHype: number;
  withdrawUsdc: number;
  withdrawHype: number;
  payoutUsdc: number;
  harvestUserUsdc: number;
  uniqueWallets: number;
  scannedBlocks: bigint;
};

const vaultDepositEvent = parseAbiItem(
  "event Deposit(address indexed caller, address indexed receiver, uint256 amountUSDC, uint256 shares)"
);
const vaultDepositHypeEvent = parseAbiItem(
  "event DepositHype(address indexed caller, address indexed receiver, uint256 amountHype, uint256 shares)"
);
const vaultWithdrawEvent = parseAbiItem(
  "event Withdraw(address indexed caller, address indexed receiver, uint256 shares, uint256 amountUSDC, uint256 amountHype)"
);
const vaultHarvestEvent = parseAbiItem(
  "event FeesHarvested(uint256 usdcFees, uint256 hypeFees, uint256 usdcFromHypeSwap, uint256 operatorUsdc, uint256 ownerUsdc, uint256 operatorHype, uint256 ownerHype, uint256 userUsdc)"
);
const airdropDistributedEvent = parseAbiItem(
  "event Distributed(bytes32 indexed distributionId, address indexed account, uint256 amount)"
);

/** Only the airdrop emits Distributed and only the vault emits the rest, so one
 *  address-array getLogs per chunk covers both contracts without cross matches. */
const ACTIVITY_EVENTS = [
  vaultDepositEvent,
  vaultDepositHypeEvent,
  vaultWithdrawEvent,
  vaultHarvestEvent,
  airdropDistributedEvent,
] as const;

type ScanPlan = { chunk: bigint; chunksPerPage: number; delayMs: number; logsRpcUrl?: string };

// The official HyperEVM RPC (rpc.hyperliquid.xyz) caps eth_getLogs around ~500
// blocks and rate-limits bursts per IP, which makes it unusable for history
// scans. dRPC accepts ~10k-block ranges, so mainnet log reads go there (same
// failover the cron scripts in scripts/lib/rpc-logs.mjs use). Deeper history
// loads page by page on demand.
const SCAN_BY_CHAIN: Partial<Record<number, ScanPlan>> = {
  999: {
    chunk: 10_000n,
    chunksPerPage: 5,
    delayMs: 300,
    logsRpcUrl: process.env.NEXT_PUBLIC_MAINNET_LOGS_RPC ?? "https://hyperliquid.drpc.org",
  },
  998: { chunk: 1_000n, chunksPerPage: 12, delayMs: 120 },
};
const DEFAULT_SCAN: ScanPlan = { chunk: 5_000n, chunksPerPage: 10, delayMs: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const logsClientCache = new Map<string, PublicClient>();

function logsClientFor(plan: ScanPlan, fallback: PublicClient): PublicClient {
  if (!plan.logsRpcUrl) return fallback;
  let client = logsClientCache.get(plan.logsRpcUrl);
  if (!client) {
    client = createPublicClient({ transport: http(plan.logsRpcUrl) });
    logsClientCache.set(plan.logsRpcUrl, client);
  }
  return client;
}

function toUsdc(v: bigint): number {
  return parseFloat(formatUnits(v, 6));
}
function toHype(v: bigint): number {
  return parseFloat(formatUnits(v, 18));
}

type RawLog = {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: string | null;
  blockNumber: bigint | null;
};

function decodeLog(log: RawLog): ActivityItem | null {
  if (log.blockNumber == null || !log.transactionHash) return null;
  const base = { txHash: log.transactionHash, blockNumber: log.blockNumber, timestamp: 0 };
  const a = log.args;
  switch (log.eventName) {
    case "Deposit":
      return { kind: "deposit", account: a.receiver as Address, usdc: toUsdc(a.amountUSDC as bigint), ...base };
    case "DepositHype":
      return { kind: "deposit", account: a.receiver as Address, hype: toHype(a.amountHype as bigint), ...base };
    case "Withdraw":
      return {
        kind: "withdraw",
        account: a.receiver as Address,
        usdc: toUsdc(a.amountUSDC as bigint),
        hype: toHype(a.amountHype as bigint),
        ...base,
      };
    case "FeesHarvested":
      return {
        kind: "harvest",
        usdc: toUsdc((a.usdcFees as bigint) + (a.usdcFromHypeSwap as bigint)),
        hype: toHype(a.hypeFees as bigint),
        ...base,
      };
    case "Distributed":
      return { kind: "payout", account: a.account as Address, usdc: toUsdc(a.amount as bigint), ...base };
    default:
      return null;
  }
}

export type ActivityPage = {
  items: ActivityItem[];
  /** Newest block covered by this page (inclusive). */
  fromBlock: bigint;
  /** Oldest block covered by this page (inclusive). */
  toBlock: bigint;
  /** Cursor for the next (older) page; null when block 0 was reached. */
  nextCursor: string | null;
  /** Ranges skipped because the RPC kept rejecting them (rate limit). */
  skippedRanges: number;
};

async function scanPage(
  fallbackClient: PublicClient,
  chainId: number,
  addresses: Address[],
  cursor: string | null
): Promise<ActivityPage> {
  const plan = SCAN_BY_CHAIN[chainId] ?? DEFAULT_SCAN;
  const client = logsClientFor(plan, fallbackClient);
  const startBlock = cursor !== null ? BigInt(cursor) : await client.getBlockNumber();

  const items: ActivityItem[] = [];
  let toBlock = startBlock;
  let oldest = startBlock;
  let skippedRanges = 0;

  for (let i = 0; i < plan.chunksPerPage && toBlock > 0n; i++) {
    const fromBlock = toBlock >= plan.chunk ? toBlock - plan.chunk + 1n : 0n;
    if (i > 0 && plan.delayMs > 0) await sleep(plan.delayMs);

    let logs: RawLog[] | null = null;
    for (let attempt = 0; attempt < 2 && logs === null; attempt++) {
      try {
        logs = (await client.getLogs({
          address: addresses,
          events: ACTIVITY_EVENTS,
          fromBlock,
          toBlock,
          strict: true,
        })) as unknown as RawLog[];
      } catch {
        // Likely the RPC rate limit — back off once, then skip the range.
        if (attempt === 0) await sleep(1_500);
      }
    }
    if (logs) {
      for (const log of logs) {
        const item = decodeLog(log);
        if (item) items.push(item);
      }
    } else {
      skippedRanges += 1;
    }
    oldest = fromBlock;
    toBlock = fromBlock - 1n;
  }

  items.sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1));

  // Resolve timestamps for displayed items, sequentially — the same rate limit
  // applies to eth_getBlockByNumber bursts.
  const uniqueBlocks = [...new Set(items.map((i) => i.blockNumber))].slice(0, 20);
  const blockTs = new Map<bigint, number>();
  for (const bn of uniqueBlocks) {
    try {
      if (plan.delayMs > 0 && blockTs.size > 0) await sleep(Math.min(plan.delayMs, 150));
      const block = await client.getBlock({ blockNumber: bn });
      blockTs.set(bn, Number(block.timestamp) * 1000);
    } catch {
      // Leave timestamp at 0; the UI shows the block number instead.
    }
  }
  for (const item of items) item.timestamp = blockTs.get(item.blockNumber) ?? 0;

  return {
    items,
    fromBlock: startBlock,
    toBlock: oldest,
    nextCursor: oldest > 0n ? String(oldest - 1n) : null,
    skippedRanges,
  };
}

export function summarizeActivity(pages: ActivityPage[]): ActivitySummary {
  const wallets = new Set<string>();
  const summary: ActivitySummary = {
    depositUsdc: 0,
    depositHype: 0,
    withdrawUsdc: 0,
    withdrawHype: 0,
    payoutUsdc: 0,
    harvestUserUsdc: 0,
    uniqueWallets: 0,
    scannedBlocks: 0n,
  };
  for (const page of pages) {
    summary.scannedBlocks += page.fromBlock - page.toBlock + 1n;
    for (const i of page.items) {
      if (i.account) wallets.add(i.account.toLowerCase());
      if (i.kind === "deposit") {
        summary.depositUsdc += i.usdc ?? 0;
        summary.depositHype += i.hype ?? 0;
      } else if (i.kind === "withdraw") {
        summary.withdrawUsdc += i.usdc ?? 0;
        summary.withdrawHype += i.hype ?? 0;
      } else if (i.kind === "payout") {
        summary.payoutUsdc += i.usdc ?? 0;
      } else if (i.kind === "harvest") {
        summary.harvestUserUsdc += i.usdc ?? 0;
      }
    }
  }
  summary.uniqueWallets = wallets.size;
  return summary;
}

export function useAdminActivity() {
  const chainId = useEffectiveChainId();
  const deployment = getDeployment(chainId);
  const vault = deployment ? getVaultAddress(deployment) : undefined;
  const airdrop = deployment?.airdrop;
  const publicClient = usePublicClient({ chainId });
  const addresses = useMemo(
    () => [vault, airdrop].filter((a): a is Address => !!a),
    [vault, airdrop]
  );

  const query = useInfiniteQuery({
    queryKey: ["admin-activity", chainId, vault ?? "", airdrop ?? ""],
    enabled: !!publicClient && addresses.length > 0,
    staleTime: 120_000,
    // Cursors are plain strings so pages serialize; bigint stays internal.
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: ActivityPage) => lastPage.nextCursor,
    queryFn: ({ pageParam }) => scanPage(publicClient as PublicClient, chainId, addresses, pageParam),
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  );
  const summary = useMemo(
    () => (query.data ? summarizeActivity(query.data.pages) : undefined),
    [query.data]
  );
  const skippedRanges = query.data?.pages.reduce((n, p) => n + p.skippedRanges, 0) ?? 0;

  return { ...query, items, summary, skippedRanges };
}
