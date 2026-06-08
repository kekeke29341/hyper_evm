// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoolMath} from "../src/libraries/PoolMath.sol";

contract PoolMathExtendedTest is Test {
    function test_Quote() public pure {
        uint256 out = PoolMath.quote(1 ether, 100 ether, 200_000e6);
        assertEq(out, 2000e6);
    }

    function test_GetAmountOutWithFee() public pure {
        uint256 out = PoolMath.getAmountOut(1 ether, 100 ether, 200_000e6, 30);
        assertGt(out, 0);
        assertLt(out, 2000e6);
    }

    function test_Sqrt() public pure {
        assertEq(PoolMath.sqrt(0), 0);
        assertEq(PoolMath.sqrt(1), 1);
        assertEq(PoolMath.sqrt(4), 2);
        assertEq(PoolMath.sqrt(9), 3);
        assertEq(PoolMath.sqrt(100), 10);
    }
}
