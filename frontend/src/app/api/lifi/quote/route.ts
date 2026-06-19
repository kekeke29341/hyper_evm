import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/api/rateLimit";

const LIFI_BASE = "https://li.quest/v1";

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const limited = checkRateLimit(`lifi-quote:${ip}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const p = req.nextUrl.searchParams;
  const fromChain = p.get("fromChain");
  const toChain = p.get("toChain");
  const fromToken = p.get("fromToken");
  const toToken = p.get("toToken");
  const fromAmount = p.get("fromAmount");
  const fromAddress = p.get("fromAddress");
  const slippage = p.get("slippage") ?? "0.005";

  if (!fromChain || !toChain || !fromToken || !toToken || !fromAmount || !fromAddress) {
    return NextResponse.json({ error: "Missing required quote parameters" }, { status: 400 });
  }

  const integrator = process.env.LIFI_INTEGRATOR ?? process.env.NEXT_PUBLIC_LIFI_INTEGRATOR ?? "hyperpool";

  const url = new URL(`${LIFI_BASE}/quote`);
  url.searchParams.set("fromChain", fromChain);
  url.searchParams.set("toChain", toChain);
  url.searchParams.set("fromToken", fromToken);
  url.searchParams.set("toToken", toToken);
  url.searchParams.set("fromAmount", fromAmount);
  url.searchParams.set("fromAddress", fromAddress);
  url.searchParams.set("slippage", slippage);
  url.searchParams.set("integrator", integrator);
  url.searchParams.set("fee", "0");
  url.searchParams.set("toAddress", fromAddress);

  const headers: HeadersInit = { Accept: "application/json" };
  const apiKey = process.env.LIFI_API_KEY;
  if (apiKey) headers["x-lifi-api-key"] = apiKey;

  try {
    const res = await fetch(url.toString(), { headers, next: { revalidate: 0 } });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message ?? data?.error ?? "Li.FI quote failed", details: data },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Li.FI request failed" },
      { status: 502 }
    );
  }
}
