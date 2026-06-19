import { describe, it, expect } from "vitest";
import {
  BRIDGE_CHAINS,
  EVM_BRIDGE_CHAINS,
  getBridgeChain,
  getLifiChainId,
  getSwapTokensForChain,
  pickDefaultSwapToken,
  cycleSwapToken,
  resolveLifiToken,
  isCrossChainBridge,
  isEvmBridgeRoute,
  hyperEvmLifiNotice,
} from "@/lib/lifi/config";

describe("lifi config", () => {
  it("includes HyperEVM as default bridge chain", () => {
    const hyperevm = getBridgeChain("hyperevm");
    expect(hyperevm?.label).toBe("HyperEVM");
    expect(hyperevm?.lifiChainId).toBe(999);
    expect(hyperevm?.walletChainIds).toContain(998);
  });

  it("getLifiChainId resolves known chains", () => {
    expect(getLifiChainId("ethereum")).toBe(1);
    expect(getLifiChainId("arbitrum")).toBe(42161);
    expect(getLifiChainId("unknown")).toBeNull();
  });

  it("resolveLifiToken maps USDC on HyperEVM mainnet", () => {
    const token = resolveLifiToken("hyperevm", "USDC");
    expect(token).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("isCrossChainBridge detects different chains", () => {
    expect(isCrossChainBridge("hyperevm", "ethereum")).toBe(true);
    expect(isCrossChainBridge("hyperevm", "hyperevm")).toBe(false);
  });

  it("isEvmBridgeRoute requires both EVM chains", () => {
    expect(isEvmBridgeRoute("hyperevm", "ethereum")).toBe(true);
    expect(isEvmBridgeRoute("hyperevm", "solana")).toBe(false);
  });

  it("hyperEvmLifiNotice warns on testnet chain 998", () => {
    expect(hyperEvmLifiNotice(998)).toContain("999");
    expect(hyperEvmLifiNotice(999)).toBeNull();
  });

  it("BRIDGE_CHAINS has unique ids", () => {
    const ids = BRIDGE_CHAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("EVM_BRIDGE_CHAINS excludes non-EVM chains", () => {
    expect(EVM_BRIDGE_CHAINS.every((c) => c.isEvm)).toBe(true);
    expect(EVM_BRIDGE_CHAINS.find((c) => c.id === "solana")).toBeUndefined();
  });

  it("getSwapTokensForChain returns chain-appropriate tokens", () => {
    expect(getSwapTokensForChain("hyperevm")).toEqual(["kHYPE", "USDC"]);
    expect(getSwapTokensForChain("ethereum")).toContain("ETH");
    expect(getSwapTokensForChain("ethereum")).toContain("USDC");
    expect(getSwapTokensForChain("ethereum")).toContain("WETH");
    expect(getSwapTokensForChain("arbitrum")).toContain("ETH");
    expect(getSwapTokensForChain("unknown")).toEqual(["USDC"]);
  });

  it("pickDefaultSwapToken avoids excluded token", () => {
    expect(pickDefaultSwapToken("hyperevm", "kHYPE")).toBe("USDC");
    expect(pickDefaultSwapToken("ethereum", "USDC")).toBe("ETH");
  });

  it("cycleSwapToken rotates within chain options", () => {
    expect(cycleSwapToken("ETH", "ethereum")).toBe("USDC");
    expect(cycleSwapToken("USDC", "ethereum")).toBe("WETH");
    expect(cycleSwapToken("kHYPE", "hyperevm", "USDC")).toBe("kHYPE");
  });
});
