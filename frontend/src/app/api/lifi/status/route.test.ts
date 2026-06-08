import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /api/lifi/status", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "DONE", substatus: "COMPLETED" }),
      })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns 400 when txHash is missing", async () => {
    const req = new NextRequest("http://localhost/api/lifi/status");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("txHash required");
  });

  it("proxies status request to Li.FI", async () => {
    const req = new NextRequest(
      "http://localhost/api/lifi/status?txHash=0xabc123&fromChain=1&toChain=999"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("DONE");
    expect(fetch).toHaveBeenCalledOnce();
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("li.quest/v1/status");
    expect(calledUrl).toContain("txHash=0xabc123");
  });
});
