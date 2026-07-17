import { describe, expect, it } from "vitest";
import { collectErrorText, formatBridgeError, formatLifiBridgeStatus } from "@/lib/lifi/errors";

const labels = {
  userRejected: "Rejected by wallet",
  insufficientFunds: "Insufficient balance",
  wrongChain: "Wrong network",
  approvalFailed: "Approval failed",
  gasFailed: "Gas too low",
  networkFailed: "Network error",
  rateLimited: "Rate limited",
  bridgeIncomplete: "Bridge did not complete",
  switchNetworkFailed: "Switch failed",
  unknown: "Unknown error",
};

describe("formatBridgeError", () => {
  it("maps wallet rejection", () => {
    expect(
      formatBridgeError(new Error("User rejected the request."), labels)
    ).toBe("Rejected by wallet");
  });

  it("maps insufficient funds", () => {
    expect(
      formatBridgeError({ shortMessage: "Insufficient funds for gas * price + value" }, labels)
    ).toBe("Insufficient balance");
  });

  it("returns API detail when no pattern matches", () => {
    expect(
      formatBridgeError(new Error("No available quotes for the requested transfer"), labels)
    ).toBe("No available quotes for the requested transfer");
  });

  it("collects nested cause messages", () => {
    const err = new Error("Transaction failed", {
      cause: new Error("execution reverted: STF"),
    });
    expect(collectErrorText(err)).toContain("STF");
  });
});

describe("formatLifiBridgeStatus", () => {
  it("returns null for non-failed status", () => {
    expect(formatLifiBridgeStatus("DONE", undefined, labels)).toBeNull();
  });

  it("maps known substatus", () => {
    expect(formatLifiBridgeStatus("FAILED", "INSUFFICIENT_BALANCE", labels)).toBe(
      "Insufficient balance"
    );
  });
});
