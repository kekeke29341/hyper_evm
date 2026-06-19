// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ProjectXPrice} from "../src/libraries/ProjectXPrice.sol";
import {TickMath} from "../src/libraries/TickMath.sol";

contract ProjectXPriceTest is Test {
    function test_TicksFromRefPriceOrdering() public pure {
        uint256 price = 42e6 * 1e12;
        (int24 lower, int24 upper) = ProjectXPrice.ticksFromRefPrice(price, true, 1000, 3000);
        assertLt(lower, upper);
        assertEq(lower % 10, 0);
        assertEq(upper % 10, 0);
    }

    function test_SqrtRoundTripNear42Usdc() public pure {
        uint256 price = 42e6 * 1e12;
        uint160 sqrt = ProjectXPrice.sqrtPriceX96FromRefPrice(price, true);
        int24 tick = TickMath.getTickAtSqrtRatio(sqrt);
        uint160 back = TickMath.getSqrtRatioAtTick(tick);
        assertApproxEqRel(sqrt, back, 0.001e18);
    }

    function test_UpperTickAboveLowerForHigherUpperPrice() public pure {
        uint256 price = 50e6 * 1e12;
        (int24 lower, int24 upper) = ProjectXPrice.ticksFromRefPrice(price, true, 1000, 3000);
        uint160 sqrtLower = TickMath.getSqrtRatioAtTick(lower);
        uint160 sqrtUpper = TickMath.getSqrtRatioAtTick(upper);
        assertLt(sqrtLower, sqrtUpper);
    }
}
