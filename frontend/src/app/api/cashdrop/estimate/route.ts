import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { checkRateLimit, clientIp } from "@/lib/api/rateLimit";
import { getDeployment } from "@/lib/contracts";
import { fetchCashdropEstimate } from "@/lib/earnings/fetchCashdropEstimate";

const RPC_BY_CHAIN: Record<number, string[]> = {
  998: [
    process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet",
    "https://rpc.hyperliquid-testnet.xyz/evm",
  ],
  999: [
    process.env.MAINNET_RPC ?? process.env.RPC_URL ?? "https://rpc.hyperliquid.xyz/evm",
    "https://hyperliquid.drpc.org",
  ],
  31337: [process.env.RPC_URL ?? "http://127.0.0.1:8545"],
};

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
      rpcUrls,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "No vault position for this period" }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Estimate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
