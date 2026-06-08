import { describe, it, expect } from "vitest";
import { cn, shortenAddress } from "@/lib/utils";

describe("utils", () => {
  it("cn merges tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", undefined, "font-bold")).toBe("text-red-500 font-bold");
  });

  it("shortenAddress formats ethereum addresses", () => {
    const addr = "0x1234567890123456789012345678901234567890";
    expect(shortenAddress(addr)).toBe("0x1234...7890");
  });
});
