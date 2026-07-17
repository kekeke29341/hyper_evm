import type { Address, PublicClient } from "viem";
import { parseAbiItem } from "viem";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

function isRateLimitError(err: unknown): boolean {
  const msg = (err as { shortMessage?: string; message?: string })?.shortMessage
    ?? (err as Error)?.message
    ?? "";
  const lower = msg.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("exceeds defined limit") ||
    lower.includes("too many requests") ||
    lower.includes("ranges over")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rate-limit-friendly vault Transfer log scan (mirrors scripts/lib/rpc-logs.mjs). */
export async function scanVaultTransferLogs(
  publicClient: PublicClient,
  vault: Address,
  fromBlock: bigint,
  toBlock: bigint,
  options?: { chunkSize?: bigint; delayMs?: number; rpcUrls?: string[] }
): Promise<
  {
    args: { from: Address; to: Address; value: bigint };
    blockNumber: bigint;
    logIndex: number;
  }[]
> {
  const chunkSize = options?.chunkSize ?? 100n;
  const delayMs = options?.delayMs ?? 800;
  const rpcUrls = options?.rpcUrls ?? [];
  const logs: Awaited<ReturnType<typeof scanVaultTransferLogs>> = [];

  let start = fromBlock;
  let chunk = chunkSize;

  const { createPublicClient, http } = await import("viem");
  const clients: PublicClient[] = [publicClient];
  if (rpcUrls.length > 0 && publicClient.chain) {
    for (const url of rpcUrls) {
      clients.push(createPublicClient({ chain: publicClient.chain, transport: http(url) }));
    }
  }
  // Explicit rpcUrls are dedicated log RPCs — prefer them and keep the base
  // client as the rotation fallback.
  let clientIndex = clients.length > 1 ? 1 : 0;

  while (start <= toBlock) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n;
    let ok = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const client = clients[clientIndex % clients.length];
        const batch = await client.getLogs({
          address: vault,
          event: transferEvent,
          fromBlock: start,
          toBlock: end,
        });
        for (const log of batch) {
          if (!log.args.from || !log.args.to || log.args.value === undefined) continue;
          logs.push({
            args: {
              from: log.args.from,
              to: log.args.to,
              value: log.args.value,
            },
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
          });
        }
        ok = true;
        break;
      } catch (err) {
        if (isRateLimitError(err)) {
          if (clients.length > 1) clientIndex += 1;
          if (chunk > 25n) chunk /= 2n;
        }
        if (attempt < 4) {
          await sleep(isRateLimitError(err) ? 2500 * (attempt + 1) : 1200 * (attempt + 1));
          continue;
        }
      }
    }

    start = end + 1n;
    if (delayMs > 0) await sleep(ok ? delayMs : delayMs * 3);
  }

  return logs;
}
