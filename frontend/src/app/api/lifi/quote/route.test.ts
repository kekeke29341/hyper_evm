import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /api/lifi/quote", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "quote-1", estimate: { toAmount: "1000000" } }),
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns 400 when required params are missing", async () => {
    const req = new NextRequest("http://localhost/api/lifi/quote");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required/);
  });

  it("proxies quote request to Li.FI with fee=0", async () => {
    const url =
      "http://localhost/api/lifi/quote?" +
      "fromChain=1&toChain=999&fromToken=0xabc&toToken=0xdef&fromAmount=1000000&fromAddress=0x1111111111111111111111111111111111111111";
    const req = new NextRequest(url);
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("li.quest/v1/quote");
    expect(calledUrl).toContain("fee=0");
    expect(calledUrl).toContain("integrator=projectx");
  });

  it("returns upstream error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: "No route found" }),
      })
    );

    const url =
      "http://localhost/api/lifi/quote?" +
      "fromChain=1&toChain=999&fromToken=0xabc&toToken=0xdef&fromAmount=1000000&fromAddress=0x1111111111111111111111111111111111111111";
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(422);
  });
});
