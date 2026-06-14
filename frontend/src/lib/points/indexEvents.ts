import type { Address, PublicClient } from "viem";
import { formatUnits, parseAbiItem } from "viem";
import { formatMultiplier, type LeaderboardRow } from "./multiplier";
import { shortenAddress } from "@/lib/utils";

export const pointsRecordedEvent = parseAbiItem(
  "event PointsRecorded(address indexed user, address indexed pool, uint256 feeAmount)"
);

export const refereeBoundEvent = parseAbiItem(
  "event RefereeBound(address indexed referee, address indexed referrer, bytes32 code)"
);

async function fetchEventLogs(
  publicClient: PublicClient,
  params: {
    address: Address;
    event: typeof pointsRecordedEvent | typeof refereeBoundEvent;
    chainId: number;
  }
) {
  const latest = await publicClient.getBlockNumber();
  const windows =
    params.chainId === 998 || params.chainId === 999
      ? [50_000n, 10_000n, 2_000n]
      : [20_000n, 5_000n];

  for (const window of windows) {
    const fromBlock = latest > window ? latest - window : 0n;
    try {
      return await publicClient.getLogs({
        address: params.address,
        event: params.event,
        fromBlock,
        toBlock: latest,
        strict: true,
      });
    } catch {
      // RPC may reject wide eth_getLogs ranges — retry with a smaller window.
    }
  }
  return [];
}

async function filterLogsSinceEpoch(
  publicClient: PublicClient,
  logs: Awaited<ReturnType<PublicClient["getLogs"]>>,
  epochStartSec: number
) {
  const blockTs = new Map<bigint, number>();
  const filtered: typeof logs = [];

  for (const log of logs) {
    if (log.blockNumber == null) continue;
    const blockNumber = log.blockNumber;
    let ts = blockTs.get(blockNumber);
    if (ts === undefined) {
      try {
        const block = await publicClient.getBlock({ blockNumber });
        ts = Number(block.timestamp);
        blockTs.set(blockNumber, ts);
      } catch {
        continue;
      }
    }
    if (ts >= epochStartSec) filtered.push(log);
  }
  return filtered;
}

export async function fetchPointsLeaderboard(
  publicClient: PublicClient,
  pointsDistributor: Address,
  chainId: number,
  epochStartSec: number,
  limit = 5
): Promise<LeaderboardRow[]> {
  const logs = await fetchEventLogs(publicClient, {
    address: pointsDistributor,
    event: pointsRecordedEvent,
    chainId,
  });

  const epochLogs = await filterLogsSinceEpoch(publicClient, logs, epochStartSec);

  const totals = new Map<string, bigint>();
  for (const log of epochLogs) {
    if (!("args" in log) || !log.args || Array.isArray(log.args)) continue;
    const args = log.args as { user: Address; feeAmount: bigint };
    const user = args.user;
    const added = args.feeAmount;
    const key = user.toLowerCase();
    totals.set(key, (totals.get(key) ?? 0n) + added);
  }

  const sorted = [...totals.entries()].sort((a, b) => (a[1] > b[1] ? -1 : 1));

  return sorted.slice(0, limit).map(([addr, pts], i) => {
    const rank = i + 1;
    const points = Number(formatUnits(pts, 18));
    return {
      rank,
      address: shortenAddress(addr),
      addressFull: addr,
      points,
      multiplier: formatMultiplier(rank),
    };
  });
}

export type ReferralLeaderboardRow = {
  rank: number;
  address: string;
  referrals: number;
};

export async function fetchReferralLeaderboard(
  publicClient: PublicClient,
  referralRegistry: Address,
  chainId: number,
  limit = 5
): Promise<ReferralLeaderboardRow[]> {
  const logs = await fetchEventLogs(publicClient, {
    address: referralRegistry,
    event: refereeBoundEvent,
    chainId,
  });

  const counts = new Map<string, number>();
  for (const log of logs) {
    if (!("args" in log) || !log.args || Array.isArray(log.args)) continue;
    const referrer = (log.args as { referrer: Address }).referrer.toLowerCase();
    counts.set(referrer, (counts.get(referrer) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([addr, referrals], i) => ({
      rank: i + 1,
      address: shortenAddress(addr),
      referrals,
    }));
}
