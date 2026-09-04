// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FullMath} from "./FullMath.sol";
import {PoolMath} from "./PoolMath.sol";
import {ProjectXConstants} from "./ProjectXConstants.sol";
import {TickMath} from "./TickMath.sol";

/// @title ProjectXPrice — ref price ↔ Uniswap V3 ticks for a generic base/quote pool
/// @dev `priceDiv = 10^(baseDecimals + 18 − quoteDecimals)` is the constant that bridges the
///      canonical ref price (humanPrice * 1e18 = quote-per-base scaled by 1e18) to the pool's
///      raw token-unit price. For the legacy USDC(6)/WHYPE(18) pool this reduces to 1e30, so the
///      generalization is regression-exact. `quoteIsToken0` = (pool token0 is the quote token).
library ProjectXPrice {
    int24 internal constant TICK_SPACING = 60;

    function sqrtPriceX96FromRefPrice(uint256 refPriceQuotePerBase18, bool quoteIsToken0, uint256 priceDiv)
        internal
        pure
        returns (uint160 sqrtPriceX96)
    {
        require(refPriceQuotePerBase18 > 0, "ProjectXPrice: ZERO");
        require(priceDiv > 0, "ProjectXPrice: PRICE_DIV");

        // refPrice is quote-per-base * 1e18. The Uniswap pool price is in raw token units, so it
        // must also carry the base/quote decimal gap; the bridging constant is
        // priceDiv = 10^(baseDec + 18 − quoteDec). For USDC(6)/WHYPE(18) that is 1e30.
        uint256 ratioX192;
        if (quoteIsToken0) {
            ratioX192 = FullMath.mulDiv(priceDiv, uint256(1) << 192, refPriceQuotePerBase18);
        } else {
            ratioX192 = FullMath.mulDiv(refPriceQuotePerBase18, uint256(1) << 192, priceDiv);
        }

        sqrtPriceX96 = uint160(PoolMath.sqrt(ratioX192));
        require(sqrtPriceX96 >= TickMath.MIN_SQRT_RATIO && sqrtPriceX96 < TickMath.MAX_SQRT_RATIO, "ProjectXPrice: OOB");
    }

    function ticksFromRefPrice(
        uint256 refPriceQuotePerBase18,
        bool quoteIsToken0,
        uint256 priceDiv,
        uint256 upperBps,
        uint256 lowerBps
    ) internal pure returns (int24 tickLower, int24 tickUpper) {
        require(upperBps > 0 && lowerBps > 0, "ProjectXPrice: RANGE");

        uint256 upperPrice = (refPriceQuotePerBase18 * (ProjectXConstants.BPS + upperBps)) / ProjectXConstants.BPS;
        uint256 lowerPrice = (refPriceQuotePerBase18 * (ProjectXConstants.BPS - lowerBps)) / ProjectXConstants.BPS;
        require(lowerPrice > 0, "ProjectXPrice: LOWER_ZERO");

        int24 rawLower = TickMath.getTickAtSqrtRatio(sqrtPriceX96FromRefPrice(lowerPrice, quoteIsToken0, priceDiv));
        int24 rawUpper = TickMath.getTickAtSqrtRatio(sqrtPriceX96FromRefPrice(upperPrice, quoteIsToken0, priceDiv));

        if (rawLower > rawUpper) {
            (rawLower, rawUpper) = (rawUpper, rawLower);
        }

        tickLower = floorTick(rawLower);
        tickUpper = ceilTick(rawUpper);
        require(tickLower < tickUpper, "ProjectXPrice: INVERTED");
    }

    function floorTick(int24 tick) internal pure returns (int24) {
        int24 c = tick / TICK_SPACING;
        if (tick < 0 && tick % TICK_SPACING != 0) c -= 1;
        return c * TICK_SPACING;
    }

    function ceilTick(int24 tick) internal pure returns (int24) {
        int24 c = tick / TICK_SPACING;
        if (tick > 0 && tick % TICK_SPACING != 0) c += 1;
        return c * TICK_SPACING;
    }
}
