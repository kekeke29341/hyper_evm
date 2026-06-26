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
];

/** EVM chains available in swap/bridge UI (Solana excluded — not supported by wagmi Li.FI flow). */
export const EVM_BRIDGE_CHAINS = BRIDGE_CHAINS.filter((c) => c.isEvm);

export type SwapToken = "kHYPE" | "USDC" | "ETH" | "WETH" | "WBTC" | "DAI" | "USDT";

const SWAP_TOKENS_BY_CHAIN: Record<string, SwapToken[]> = {
  hyperevm: ["kHYPE", "USDC"],
  ethereum: ["ETH", "USDC", "WETH", "WBTC", "DAI", "USDT"],
  arbitrum: ["ETH", "USDC", "WETH", "WBTC", "DAI", "USDT"],
  base: ["ETH", "USDC", "WETH", "DAI"],
  polygon: ["ETH", "USDC", "WETH", "DAI", "USDT"],
};

export function getSwapTokensForChain(chainUiId: string): SwapToken[] {
  return SWAP_TOKENS_BY_CHAIN[chainUiId] ?? ["USDC"];
}

export function pickDefaultSwapToken(chainUiId: string, exclude?: SwapToken): SwapToken {
  const options = getSwapTokensForChain(chainUiId).filter((t) => t !== exclude);
  return options[0] ?? "USDC";
}

export function cycleSwapToken(
  current: SwapToken,
  chainUiId: string,
  exclude?: SwapToken
): SwapToken {
  const options = getSwapTokensForChain(chainUiId).filter((t) => t !== exclude);
  if (options.length === 0) return "USDC";
  const idx = options.indexOf(current);
  return options[(idx + 1) % options.length];
}

export function isHyperEvmChain(chainUiId: string): boolean {
  return chainUiId === "hyperevm";
}

/** Tokens that map to on-chain deployment balances (kHYPE/USDC on HyperEVM). */
export function isDeploymentSwapToken(token: SwapToken): token is "kHYPE" | "USDC" {
  return token === "kHYPE" || token === "USDC";
}

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
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  42161: {
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35242523fBab1",
    WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    DAI: "0xDA10009cBd5D07dd0CEcc66162FC23094781Bb57",
    USDT: "0xFd086bC7CD5C481DCC9CC88543858EFC020008",
  },
  8453: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x4200000000000000000000000000000000000006",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  },
  137: {
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
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
  if (symbol.startsWith("0x")) return symbol;
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
    return "Li.FI routes HyperEVM via mainnet (chain 999). Use mainnet for bridge deposits.";
  }
  return null;
}
