import { NextRequest, NextResponse } from "next/server";

const LIFI_BASE = "https://li.quest/v1";

export async function GET(req: NextRequest) {
  const txHash = req.nextUrl.searchParams.get("txHash");
  const bridge = req.nextUrl.searchParams.get("bridge") ?? "lifi";
  const fromChain = req.nextUrl.searchParams.get("fromChain");
  const toChain = req.nextUrl.searchParams.get("toChain");

  if (!txHash) {
    return NextResponse.json({ error: "txHash required" }, { status: 400 });
  }

  const url = new URL(`${LIFI_BASE}/status`);
  url.searchParams.set("txHash", txHash);
  url.searchParams.set("bridge", bridge);
  if (fromChain) url.searchParams.set("fromChain", fromChain);
  if (toChain) url.searchParams.set("toChain", toChain);

  const headers: HeadersInit = { Accept: "application/json" };
  const apiKey = process.env.LIFI_API_KEY;
  if (apiKey) headers["x-lifi-api-key"] = apiKey;

  try {
    const res = await fetch(url.toString(), { headers, next: { revalidate: 0 } });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.message ?? "Status fetch failed" }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Li.FI status request failed" },
      { status: 502 }
    );
  }
}
