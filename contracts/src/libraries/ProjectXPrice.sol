// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FullMath} from "./FullMath.sol";
import {PoolMath} from "./PoolMath.sol";
import {ProjectXConstants} from "./ProjectXConstants.sol";
import {TickMath} from "./TickMath.sol";

/// @title ProjectXPrice — ref price ↔ Uniswap V3 ticks for WHYPE/USDC pool
library ProjectXPrice {
    int24 internal constant TICK_SPACING = 10;

    function sqrtPriceX96FromRefPrice(uint256 priceUsdc6PerHype18, bool usdcIsToken0)
        internal
        pure
        returns (uint160 sqrtPriceX96)
    {
        require(priceUsdc6PerHype18 > 0, "ProjectXPrice: ZERO");

        uint256 ratioX192;
        if (usdcIsToken0) {
            ratioX192 = FullMath.mulDiv(1e18, uint256(1) << 192, priceUsdc6PerHype18);
        } else {
            ratioX192 = FullMath.mulDiv(priceUsdc6PerHype18, uint256(1) << 192, 1e18);
        }

        sqrtPriceX96 = uint160(PoolMath.sqrt(ratioX192));
        require(sqrtPriceX96 >= TickMath.MIN_SQRT_RATIO && sqrtPriceX96 < TickMath.MAX_SQRT_RATIO, "ProjectXPrice: OOB");
    }

    function ticksFromRefPrice(
        uint256 priceUsdc6PerHype18,
        bool usdcIsToken0,
        uint256 upperBps,
        uint256 lowerBps
    ) internal pure returns (int24 tickLower, int24 tickUpper) {
        require(upperBps > 0 && lowerBps > 0, "ProjectXPrice: RANGE");

        uint256 upperPrice = (priceUsdc6PerHype18 * (ProjectXConstants.BPS + upperBps)) / ProjectXConstants.BPS;
        uint256 lowerPrice = (priceUsdc6PerHype18 * (ProjectXConstants.BPS - lowerBps)) / ProjectXConstants.BPS;
        require(lowerPrice > 0, "ProjectXPrice: LOWER_ZERO");

        int24 rawLower = TickMath.getTickAtSqrtRatio(sqrtPriceX96FromRefPrice(lowerPrice, usdcIsToken0));
        int24 rawUpper = TickMath.getTickAtSqrtRatio(sqrtPriceX96FromRefPrice(upperPrice, usdcIsToken0));

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
