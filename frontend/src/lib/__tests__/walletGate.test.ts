import { describe, it, expect } from "vitest";
import { isAllowedWallet, isWalletGateActive, parseAllowedWallets } from "@/lib/walletGate";

describe("walletGate", () => {
  const wallets = parseAllowedWallets(
    "0xAbCdEf1234567890123456789012345678901234, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  );

  it("parseAllowedWallets normalizes and deduplicates", () => {
    expect(wallets).toEqual([
      "0xabcdef1234567890123456789012345678901234",
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    ]);
  });

  it("parseAllowedWallets ignores invalid entries", () => {
    expect(parseAllowedWallets("not-an-address, 0x1234")).toEqual([]);
  });

  it("isAllowedWallet is case-insensitive", () => {
    expect(isAllowedWallet("0xABCDEF1234567890123456789012345678901234", wallets)).toBe(true);
    expect(isAllowedWallet("0x0000000000000000000000000000000000000001", wallets)).toBe(false);
  });

  it("isWalletGateActive requires enable flag and non-empty allowlist", () => {
    expect(isWalletGateActive(false, wallets)).toBe(false);
    expect(isWalletGateActive(true, [])).toBe(false);
    expect(isWalletGateActive(true, wallets)).toBe(true);
  });
});
