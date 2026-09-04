/**
 * LEGACY HYPE/USDC ONLY. HyperCore oraclePx (USD per 1 HYPE) → vault refPrice scale
 * (usdc6PerHype18). This is inherently USDC-denominated and matches the live vault's old bytecode.
 *
 * HYPE-quoted pools (UPUMP/UBTC/UETH) do NOT use this: they have no meaningful HYPE/USD oracle, so
 * the keeper reads the adapter's live pool price (quote-per-base * 1e18) directly and the on-chain
 * pool-TWAP guard protects entry. Do not generalize the 1e14 here — the legacy vault depends on it.
 */
export function oraclePxToRefPrice(oraclePx) {
  // Match HyperpoolVault._oraclePriceUsdc6PerHype18: px * 1e14 (HyperCore 4-dec USD/HYPE)
  return BigInt(oraclePx) * 10n ** 14n;
}

export function refPriceToUsdc6(refPrice) {
  return refPrice / 10n ** 12n;
}

/** Read HYPE/USD from HyperCoreOracle on chain */
export async function fetchOracleRefPrice(publicClient, oracleAddress, assetId, oracleAbi) {
  if (!oracleAddress || oracleAddress === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  try {
    const [px, ok] = await publicClient.readContract({
      address: oracleAddress,
      abi: oracleAbi,
      functionName: "tryGetOraclePrice",
      args: [assetId],
    });
    if (!ok || px === 0n) return null;
    return oraclePxToRefPrice(px);
  } catch {
    return null;
  }
}
