import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { checkRateLimit, clientIp } from "@/lib/api/rateLimit";
import { getDeployment } from "@/lib/contracts";
import { fetchCashdropEstimate } from "@/lib/earnings/fetchCashdropEstimate";

// The weighting-period log scan grows to a full day of blocks before each
// harvest; the default serverless limit times out mid-scan.
export const maxDuration = 60;

const OFFICIAL_MAINNET_RPC = "https://rpc.hyperliquid.xyz/evm";

// Base transport for regular calls (blockNumber/getBlock/readContract). Gateways
// like drpc only expose eth_getLogs on their free tier, so never use the logs
// RPC here.
const RPC_BY_CHAIN: Record<number, string[]> = {
  998: [
    process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet",
    "https://rpc.hyperliquid-testnet.xyz/evm",
  ],
  999: [OFFICIAL_MAINNET_RPC],
  31337: [process.env.RPC_URL ?? "http://127.0.0.1:8545"],
};

// Dedicated eth_getLogs RPC — the official RPC caps ranges/rates too hard for a
// full weighting-period scan to fit inside maxDuration.
const MAINNET_LOGS_RPC = process.env.MAINNET_LOGS_RPC ?? process.env.MAINNET_RPC;

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const limited = checkRateLimit(`cashdrop-estimate:${ip}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const p = req.nextUrl.searchParams;
  const chainId = Number(p.get("chainId"));
  const addressParam = p.get("address");

  if (!chainId || !addressParam || !isAddress(addressParam)) {
    return NextResponse.json({ error: "chainId and address are required" }, { status: 400 });
  }

  const deployment = getDeployment(chainId);
  if (!deployment) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  const rpcUrls = RPC_BY_CHAIN[chainId];
  if (!rpcUrls?.length) {
    return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
  }

  const { createPublicClient, http } = await import("viem");
  const chain =
    chainId === 999
      ? { id: 999, name: "HyperEVM", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: rpcUrls } } }
      : chainId === 998
        ? { id: 998, name: "HyperEVM Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: rpcUrls } } }
        : { id: chainId, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: rpcUrls } } };

  const publicClient = createPublicClient({ chain, transport: http(rpcUrls[0]) });

  try {
    const snapshot = await fetchCashdropEstimate({
      publicClient,
      deployment,
      chainId,
      userAddress: getAddress(addressParam),
      rpcUrls: chainId === 999 && MAINNET_LOGS_RPC ? [MAINNET_LOGS_RPC] : rpcUrls,
      // A dedicated logs RPC takes ~1000-block chunks with minimal delay so the
      // scan fits inside maxDuration; the official RPC needs the slow default.
      scanOptions:
        chainId === 999 && MAINNET_LOGS_RPC
          ? { chunkSize: 1000n, delayMs: 150 }
          : undefined,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "No vault position for this period" }, { status: 404 });
    }

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Estimate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
