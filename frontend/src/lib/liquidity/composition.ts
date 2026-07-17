import type { Address } from "viem";
import { formatUnits } from "viem";
import { refPriceToUsdPerHype } from "@/lib/liquidity/price";

export type VaultAssetComposition = {
  reserveHype: number;
  reserveUsdc: number;
  lpHype: number;
  lpUsdc: number;
  idleHype: number;
  idleUsdc: number;
  hypePct: number;
  usdcPct: number;
};

export function mapAdapterTokenAmounts(
  amount0: bigint,
  amount1: bigint,
  token0: Address,
  whypeAddress: Address
): { hype: bigint; usdc: bigint } {
  const whypeIsToken0 = token0.toLowerCase() === whypeAddress.toLowerCase();
  return whypeIsToken0
    ? { hype: amount0, usdc: amount1 }
    : { hype: amount1, usdc: amount0 };
}

export function vaultCompositionFromParts(params: {
  lpHype: bigint;
  lpUsdc: bigint;
  idleHype: bigint;
  idleUsdc: bigint;
  priceUsdPerHype: number;
}): VaultAssetComposition {
  const { lpHype, lpUsdc, idleHype, idleUsdc, priceUsdPerHype } = params;
  const lpHypeN = Number(formatUnits(lpHype, 18));
  const lpUsdcN = Number(formatUnits(lpUsdc, 6));
  const idleHypeN = Number(formatUnits(idleHype, 18));
  const idleUsdcN = Number(formatUnits(idleUsdc, 6));

  const reserveHype = lpHypeN + idleHypeN;
  const reserveUsdc = lpUsdcN + idleUsdcN;
  const hypeUsd = reserveHype * priceUsdPerHype;
  const usdcUsd = reserveUsdc;
  const totalUsd = hypeUsd + usdcUsd;
  const hypePct = totalUsd > 0 ? (hypeUsd / totalUsd) * 100 : 0;
  const usdcPct = totalUsd > 0 ? (usdcUsd / totalUsd) * 100 : 0;

  return {
    reserveHype,
    reserveUsdc,
    lpHype: lpHypeN,
    lpUsdc: lpUsdcN,
    idleHype: idleHypeN,
    idleUsdc: idleUsdcN,
    hypePct,
    usdcPct,
  };
}

export function compositionFromRefPrice(
  lpHype: bigint,
  lpUsdc: bigint,
  idleHype: bigint,
  idleUsdc: bigint,
  refPrice: bigint
): VaultAssetComposition {
  return vaultCompositionFromParts({
    lpHype,
    lpUsdc,
    idleHype,
    idleUsdc,
    priceUsdPerHype: refPriceToUsdPerHype(refPrice),
  });
}
