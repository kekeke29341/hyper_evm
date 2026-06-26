"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  filterBridgeTokens,
  getPopularBridgeTokens,
  lifiChainParam,
  mergeBridgeTokens,
  type BridgeToken,
} from "@/lib/lifi/tokens";

type LifiApiToken = {
  address: string;
  symbol: string;
  name?: string;
  decimals: number;
  logoURI?: string;
  verificationStatus?: string;
};

type LifiApiTokensResponse = {
  tokens?: Record<string, LifiApiToken[]>;
};

function mapLifiTokens(raw: LifiApiToken[]): BridgeToken[] {
  return raw
    .filter((token) => token.verificationStatus !== "flagged")
    .map((token) => ({
      symbol: token.symbol,
      address: token.address,
      decimals: token.decimals,
      name: token.name,
      logoURI: token.logoURI,
    }));
}

export function useLiFiTokens(chainUiId: string, excludeSymbol?: string, search = "") {
  const chainId = lifiChainParam(chainUiId);
  const popular = useMemo(
    () => getPopularBridgeTokens(chainUiId, excludeSymbol),
    [chainUiId, excludeSymbol]
  );

  const query = useQuery({
    queryKey: ["lifi-tokens", chainId],
    enabled: chainId !== null,
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<BridgeToken[]> => {
      const res = await fetch(`/api/lifi/tokens?chain=${chainId}`);
      const data = (await res.json()) as LifiApiTokensResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load tokens");
      const chainTokens = data.tokens?.[String(chainId)] ?? [];
      return mapLifiTokens(chainTokens);
    },
  });

  const allTokens = useMemo(() => {
    if (!query.data?.length) return popular;
    return mergeBridgeTokens(popular, query.data);
  }, [popular, query.data]);

  const filteredTokens = useMemo(
    () => filterBridgeTokens(allTokens, search),
    [allTokens, search]
  );

  return {
    popularTokens: popular,
    tokens: filteredTokens,
    allTokens,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
