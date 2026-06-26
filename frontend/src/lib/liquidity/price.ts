/** On-chain refPrice scale: human USDC/HYPE × 1e18 (ProjectXAdapter / HyperpoolVault). */
export function refPriceToUsdPerHype(refPrice: bigint): number {
  if (refPrice <= 0n) return 0;
  return Number(refPrice) / 1e18;
}

/** Approximate 50/50 LP reserves from total USDC-denominated TVL and spot price. */
export function lpReservesFromTvl(totalAssetsUsdc: number, priceUsdPerHype: number): {
  reserveHype: number;
  reserveUsdc: number;
} {
  if (totalAssetsUsdc <= 0 || priceUsdPerHype <= 0) {
    return { reserveHype: 0, reserveUsdc: totalAssetsUsdc };
  }
  const usdcHalf = totalAssetsUsdc / 2;
  return {
    reserveUsdc: usdcHalf,
    reserveHype: usdcHalf / priceUsdPerHype,
  };
}
