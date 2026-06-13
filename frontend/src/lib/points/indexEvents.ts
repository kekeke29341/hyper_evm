import type { Address, PublicClient } from "viem";
import { formatUnits, parseAbiItem } from "viem";
import { formatMultiplier, type LeaderboardRow } from "./multiplier";
import { shortenAddress } from "@/lib/utils";

export const pointsRecordedEvent = parseAbiItem(
  "event PointsRecorded(address indexed user, address indexed pool, uint256 feeAmount, uint256 pointsAdded)"
);

export const refereeBoundEvent = parseAbiItem(
  "event RefereeBound(address indexed referee, address indexed referrer, bytes32 code)"
);

function logsFromBlock(chainId: number, latest: bigint): bigint {
  if (chainId === 31337) return 0n;
  const window = chainId === 998 || chainId === 999 ? 500_000n : 100_000n;
  return latest > window ? latest - window : 0n;
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
      const block = await publicClient.getBlock({ blockNumber });
      ts = Number(block.timestamp);
      blockTs.set(blockNumber, ts);
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
  const latest = await publicClient.getBlockNumber();
  const fromBlock = logsFromBlock(chainId, latest);

  const logs = await publicClient.getLogs({
    address: pointsDistributor,
    event: pointsRecordedEvent,
    fromBlock,
    toBlock: latest,
    strict: true,
  });

  const epochLogs = await filterLogsSinceEpoch(publicClient, logs, epochStartSec);

  const totals = new Map<string, bigint>();
  for (const log of epochLogs) {
    if (!("args" in log) || !log.args || Array.isArray(log.args)) continue;
    const args = log.args as { user: Address; pointsAdded: bigint };
    const user = args.user;
    const added = args.pointsAdded;
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
  const latest = await publicClient.getBlockNumber();
  const fromBlock = logsFromBlock(chainId, latest);

  const logs = await publicClient.getLogs({
    address: referralRegistry,
    event: refereeBoundEvent,
    fromBlock,
    toBlock: latest,
    strict: true,
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
