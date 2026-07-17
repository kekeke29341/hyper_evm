import type { Address } from "viem";
import { zeroAddress } from "viem";
import type { LifiQuote } from "@/lib/lifi/types";

export function quoteNeedsErc20Approval(quote: LifiQuote | undefined): boolean {
  if (!quote) return false;
  const fromToken = quote.action.fromToken;
  const approval = quote.estimate.approvalAddress;
  return Boolean(
    approval &&
      fromToken.address &&
      fromToken.address.toLowerCase() !== zeroAddress
  );
}

export function getBridgeApprovalTarget(quote: LifiQuote): {
  token: Address;
  spender: Address;
  needed: bigint;
  fromChain: number;
} | null {
  if (!quoteNeedsErc20Approval(quote)) return null;
  const spender = quote.estimate.approvalAddress as Address;
  return {
    token: quote.action.fromToken.address as Address,
    spender,
    needed: BigInt(quote.action.fromAmount),
    fromChain: quote.action.fromChainId,
  };
}
