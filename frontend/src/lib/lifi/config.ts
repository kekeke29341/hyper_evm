/** Li.FI chain + token mappings (HyperEVM testnet 998 is not on Li.FI — use 999 for bridge quotes). */

export type BridgeChainConfig = {
  id: string;
  label: string;
  /** Li.FI numeric chain id; null = not routable (e.g. Solana via wagmi) */
  lifiChainId: number | null;
  /** Wallet chains that map to this UI option */
  walletChainIds: number[];
  isEvm: boolean;
};

export const BRIDGE_CHAINS: BridgeChainConfig[] = [
  {
    id: "hyperevm",
    label: "HyperEVM",
    lifiChainId: 999,
    walletChainIds: [998, 999],
    isEvm: true,
  },
  { id: "ethereum", label: "Ethereum", lifiChainId: 1, walletChainIds: [1], isEvm: true },
  { id: "arbitrum", label: "Arbitrum", lifiChainId: 42161, walletChainIds: [42161], isEvm: true },
  { id: "base", label: "Base", lifiChainId: 8453, walletChainIds: [8453], isEvm: true },
  { id: "polygon", label: "Polygon", lifiChainId: 137, walletChainIds: [137], isEvm: true },
  { id: "solana", label: "Solana", lifiChainId: 1151111081099710, walletChainIds: [], isEvm: false },
];

/** @deprecated use BRIDGE_CHAINS */
export const CHAINS = BRIDGE_CHAINS.filter((c) => c.isEvm || c.id === "solana").map((c) => ({
  id: c.id,
  label: c.label,
  default: c.id === "hyperevm",
}));

const TOKEN_BY_CHAIN: Record<number, Record<string, string>> = {
  1: {
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    ETH: "0x0000000000000000000000000000000000000000",
  },
  42161: {
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    ETH: "0x0000000000000000000000000000000000000000",
  },
  8453: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    ETH: "0x0000000000000000000000000000000000000000",
  },
  137: {
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    ETH: "0x0000000000000000000000000000000000000000",
  },
  999: {
    USDC: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    kHYPE: "0x5555555555555555555555555555555555555555",
    HYPE: "0x5555555555555555555555555555555555555555",
  },
};

export function getBridgeChain(id: string): BridgeChainConfig | undefined {
  return BRIDGE_CHAINS.find((c) => c.id === id);
}

export function getLifiChainId(chainUiId: string): number | null {
  return getBridgeChain(chainUiId)?.lifiChainId ?? null;
}

export function resolveLifiToken(chainUiId: string, symbol: string): string {
  const lifiChain = getLifiChainId(chainUiId);
  if (lifiChain === null) return symbol;
  const byChain = TOKEN_BY_CHAIN[lifiChain];
  if (byChain?.[symbol]) return byChain[symbol];
  if (symbol === "kHYPE") return byChain?.HYPE ?? symbol;
  return symbol;
}

export function isCrossChainBridge(fromChainId: string, toChainId: string): boolean {
  return fromChainId !== toChainId;
}

export function isEvmBridgeRoute(fromChainId: string, toChainId: string): boolean {
  const from = getBridgeChain(fromChainId);
  const to = getBridgeChain(toChainId);
  return Boolean(from?.isEvm && to?.isEvm);
}

export function hyperEvmLifiNotice(walletChainId: number): string | null {
  if (walletChainId === 998) {
    return "Li.FI routes HyperEVM via mainnet (chain 999). Testnet (998) uses Project X DEX for same-chain swaps.";
  }
  return null;
}
