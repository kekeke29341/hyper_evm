import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/api/rateLimit";
import type { LifiTokensResponse } from "@/lib/lifi/tokens";

const LIFI_BASE = "https://li.quest/v1";

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const limited = checkRateLimit(`lifi-tokens:${ip}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const chain = req.nextUrl.searchParams.get("chain");
  if (!chain || !/^\d+$/.test(chain)) {
    return NextResponse.json({ error: "Missing or invalid chain parameter" }, { status: 400 });
  }

  const headers: HeadersInit = { Accept: "application/json" };
  const apiKey = process.env.LIFI_API_KEY;
  if (apiKey) headers["x-lifi-api-key"] = apiKey;

  try {
    const url = `${LIFI_BASE}/tokens?chains=${chain}`;
    const res = await fetch(url, { headers, next: { revalidate: 3600 } });
    const data = (await res.json()) as LifiTokensResponse & { message?: string; error?: string };
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message ?? data?.error ?? "Li.FI tokens failed" },
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
