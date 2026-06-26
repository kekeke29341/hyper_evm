import { getLifiChainId, getSwapTokensForChain, resolveLifiToken, type SwapToken } from "@/lib/lifi/config";

export type BridgeToken = {
  symbol: string;
  address: string;
  decimals: number;
  name?: string;
  logoURI?: string;
  popular?: boolean;
};

export type LifiTokensResponse = {
  tokens: Record<string, BridgeToken[]>;
};

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  WBTC: 8,
};

export function tokenDecimalsForSymbol(symbol: string): number {
  return TOKEN_DECIMALS[symbol] ?? 18;
}

export function bridgeTokenFromSymbol(chainUiId: string, symbol: SwapToken): BridgeToken {
  return {
    symbol: symbol === "kHYPE" ? "HYPE" : symbol,
    address: resolveLifiToken(chainUiId, symbol),
    decimals: tokenDecimalsForSymbol(symbol),
    popular: true,
  };
}

/** Curated tokens shown at the top of the picker (fast path without Li.FI search). */
export function getPopularBridgeTokens(chainUiId: string, excludeSymbol?: string): BridgeToken[] {
  return getSwapTokensForChain(chainUiId)
    .filter((symbol) => symbol !== excludeSymbol)
    .map((symbol) => bridgeTokenFromSymbol(chainUiId, symbol));
}

export function findPopularBridgeToken(
  chainUiId: string,
  symbol: string,
  excludeSymbol?: string
): BridgeToken | undefined {
  return getPopularBridgeTokens(chainUiId, excludeSymbol).find(
    (token) => token.symbol.toUpperCase() === symbol.toUpperCase()
  );
}

export function pickDefaultBridgeToken(chainUiId: string, excludeSymbol?: string): BridgeToken {
  const options = getPopularBridgeTokens(chainUiId, excludeSymbol);
  return options[0] ?? bridgeTokenFromSymbol(chainUiId, "USDC");
}

export function bridgeTokenKey(token: Pick<BridgeToken, "address" | "symbol">): string {
  return `${token.symbol.toLowerCase()}:${token.address.toLowerCase()}`;
}

export function mergeBridgeTokens(primary: BridgeToken[], secondary: BridgeToken[]): BridgeToken[] {
  const seen = new Set<string>();
  const merged: BridgeToken[] = [];

  for (const token of [...primary, ...secondary]) {
    const key = bridgeTokenKey(token);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(token);
  }

  return merged;
}

export function filterBridgeTokens(tokens: BridgeToken[], query: string, limit = 80): BridgeToken[] {
  const q = query.trim().toLowerCase();
  if (!q) return tokens.slice(0, limit);

  return tokens
    .filter((token) => {
      const symbol = token.symbol.toLowerCase();
      const name = token.name?.toLowerCase() ?? "";
      const address = token.address.toLowerCase();
      return symbol.includes(q) || name.includes(q) || address.includes(q);
    })
    .slice(0, limit);
}

export function lifiChainParam(chainUiId: string): number | null {
  return getLifiChainId(chainUiId);
}
