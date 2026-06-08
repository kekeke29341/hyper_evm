// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library PoolMath {
    uint256 internal constant MINIMUM_LIQUIDITY = 1000;
    uint256 internal constant SWAP_FEE_BPS = 30;

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB) {
        require(amountA > 0, "PoolMath: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "PoolMath: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint256 feeBps)
        internal
        pure
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "PoolMath: INSUFFICIENT_INPUT");
        require(reserveIn > 0 && reserveOut > 0, "PoolMath: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * (10_000 - feeBps);
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * 10_000 + amountInWithFee);
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
