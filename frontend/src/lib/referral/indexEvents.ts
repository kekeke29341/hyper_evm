import type { Address, PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { shortenAddress } from "@/lib/utils";

export const refereeBoundEvent = parseAbiItem(
  "event RefereeBound(address indexed referee, address indexed referrer, bytes32 code)"
);

async function fetchEventLogs(
  publicClient: PublicClient,
  params: {
    address: Address;
    event: typeof refereeBoundEvent;
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
