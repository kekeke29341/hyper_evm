import { describe, expect, it } from "vitest";
import { tabFromPath, tabPath } from "@/lib/routes";

describe("routes", () => {
  it("maps tabs to public paths", () => {
    expect(tabPath("dashboard")).toBe("/");
    expect(tabPath("deposit")).toBe("/deposit");
    expect(tabPath("liquidity")).toBe("/position");
    expect(tabPath("cashdrop")).toBe("/cashdrop");
    expect(tabPath("affiliate")).toBe("/affiliate");
  });

  it("resolves paths back to tabs", () => {
    expect(tabFromPath("/")).toBe("dashboard");
    expect(tabFromPath("/deposit")).toBe("deposit");
    expect(tabFromPath("/position")).toBe("liquidity");
    expect(tabFromPath("/cashdrop")).toBe("cashdrop");
    expect(tabFromPath("/affiliate")).toBe("affiliate");
    expect(tabFromPath("/unknown")).toBeNull();
  });
});
