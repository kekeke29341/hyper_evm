import { describe, it, expect } from "vitest";
import {
  BRIDGE_CHAINS,
  getBridgeChain,
  getLifiChainId,
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
    expect(hyperEvmLifiNotice(998)).toContain("998");
    expect(hyperEvmLifiNotice(999)).toBeNull();
  });

  it("BRIDGE_CHAINS has unique ids", () => {
    const ids = BRIDGE_CHAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
