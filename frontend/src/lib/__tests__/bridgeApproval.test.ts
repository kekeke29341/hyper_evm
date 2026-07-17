import { describe, expect, it } from "vitest";
import type { LifiQuote } from "@/lib/lifi/types";
import { getBridgeApprovalTarget, quoteNeedsErc20Approval } from "@/lib/lifi/bridgeApproval";

const wethQuote = {
  action: {
    fromToken: { address: "0x4200000000000000000000000000000000000006", symbol: "WETH" },
    fromAmount: "1000000000000000",
    fromChainId: 8453,
  },
  estimate: { approvalAddress: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" },
} as LifiQuote;

describe("bridgeApproval", () => {
  it("detects erc20 approval requirement", () => {
    expect(quoteNeedsErc20Approval(wethQuote)).toBe(true);
  });

  it("skips native ETH", () => {
    const ethQuote = {
      ...wethQuote,
      action: {
        ...wethQuote.action,
        fromToken: { address: "0x0000000000000000000000000000000000000000", symbol: "ETH" },
      },
    } as LifiQuote;
    expect(quoteNeedsErc20Approval(ethQuote)).toBe(false);
  });

  it("returns approval target", () => {
    expect(getBridgeApprovalTarget(wethQuote)).toMatchObject({
      fromChain: 8453,
      needed: 1000000000000000n,
    });
  });
});
