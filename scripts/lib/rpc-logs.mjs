/**
 * Rate-limit-friendly eth_getLogs helper for HyperEVM RPCs.
 * Public endpoints often cap block range (e.g. 999 blocks) and req/min.
 */
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
let viemPromise;

async function loadViem() {
  if (!viemPromise) {
    viemPromise = import(
      pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href
    );
  }
  return viemPromise;
}

export async function createPublicClientsForChain(chain, urls) {
  const viem = await loadViem();
  return urls.map((url) =>
    viem.createPublicClient({
      chain: chain ?? { id: 999 },
      transport: viem.http(url),
    })
  );
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function rpcUrlsForChain(chain) {
  const fromEnv = process.env.RPC_URL?.trim();
  const urls = [];
  if (fromEnv) urls.push(fromEnv);
  if (chain === 998) {
    urls.push(
      process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet",
      "https://rpc.hyperliquid-testnet.xyz/evm",
    );
    return [...new Set(urls)];
  }
  urls.push(
    process.env.MAINNET_RPC ?? "https://rpc.hyperliquid.xyz/evm",
    "https://hyperliquid.drpc.org",
  );
  return [...new Set(urls)];
}

export function parseExtraAddresses(...sources) {
  const out = new Set();
  for (const src of sources) {
    if (!src) continue;
    const parts = Array.isArray(src) ? src : String(src).split(",");
    for (const raw of parts) {
      const a = raw.trim();
      if (a) out.add(a.toLowerCase());
    }
  }
  return [...out];
}

export function isRateLimitError(err) {
  const msg = (err?.shortMessage ?? err?.message ?? "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("exceeds defined limit") ||
    msg.includes("too many requests") ||
    msg.includes("ranges over") ||
    msg.includes("invalid parameters")
  );
}

export async function retryRpc(fn, { label = "rpc", maxRetries = 6 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const wait = isRateLimitError(err) ? 2500 * (attempt + 1) : 1000 * (attempt + 1);
      if (attempt < maxRetries - 1) {
        console.warn(`${label} retry ${attempt + 1}/${maxRetries}:`, err?.shortMessage ?? err?.message ?? err);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

export async function readContractWithRetry({ publicClient, clients, request, label }) {
  const pool = clients?.length ? clients : [publicClient];
  return retryRpc(
    async (attempt) => {
      const client = pool[attempt % pool.length];
      return client.readContract(request);
    },
    { label: label ?? `readContract:${request.functionName}` },
  );
}

export async function getBlockWithRetry({ publicClient, clients, request, label }) {
  const pool = clients?.length ? clients : [publicClient];
  return retryRpc(
    async (attempt) => {
      const client = pool[attempt % pool.length];
      return client.getBlock(request);
    },
    { label: label ?? "getBlock" },
  );
}

/**
 * Scan logs in small chunks with delay + retry + optional RPC failover.
 * Hyperliquid public RPC caps eth_getLogs range (~999 blocks) and req/min.
 */
export async function scanLogs({
  publicClient,
  address,
  event,
  fromBlock,
  toBlock,
  chunkSize = 100n,
  delayMs = 800,
  maxRetries = 5,
  rpcUrls = [],
}) {
  const logs = [];
  let start = fromBlock;
  let chunk = chunkSize;
  let clientIndex = 0;
  const totalBlocks = Number(toBlock - fromBlock + 1n);
  let scannedBlocks = 0;
  let chunkCount = 0;

  let clients = [publicClient];
  if (rpcUrls.length > 0) {
    const viem = await loadViem();
    const chain = publicClient.chain ?? { id: 999 };
    clients = rpcUrls.map((url) =>
      viem.createPublicClient({ chain, transport: viem.http(url) })
    );
  }

  while (start <= toBlock) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n;
    let ok = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = clients[clientIndex % clients.length];
        const batch = await client.getLogs({
          address,
          event,
          fromBlock: start,
          toBlock: end,
        });
        logs.push(...batch);
        ok = true;
        break;
      } catch (err) {
        const rateLimited = isRateLimitError(err);
        if (rateLimited && clients.length > 1) {
          clientIndex += 1;
        }
        if (rateLimited && chunk > 25n) {
          chunk = chunk / 2n;
        }
        const wait = rateLimited ? 2500 * (attempt + 1) : 1200 * (attempt + 1);
        if (attempt < maxRetries - 1) {
          await sleep(wait);
          continue;
        }
        console.warn(
          `Log scan gave up ${start}-${end}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    if (ok) {
      scannedBlocks += Number(end - start + 1n);
      chunkCount += 1;
      if (chunkCount % 50 === 0 || end >= toBlock) {
        const pct = totalBlocks > 0 ? ((scannedBlocks / totalBlocks) * 100).toFixed(1) : "100";
        console.log(`Log scan progress: ${scannedBlocks}/${totalBlocks} blocks (${pct}%)`);
      }
      start = end + 1n;
      if (delayMs > 0) await sleep(delayMs);
    } else {
      start = end + 1n;
      if (delayMs > 0) await sleep(delayMs * 3);
    }
  }

  return logs;
}
