// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV3Pool} from "../interfaces/IUniswapV3Pool.sol";

/// @title MockUniswapV3Pool — configurable slot0 for adapter NAV tests
contract MockUniswapV3Pool is IUniswapV3Pool {
    uint160 public sqrtPriceX96;
    int24 public tick;

    constructor(uint160 _sqrtPriceX96, int24 _tick) {
        sqrtPriceX96 = _sqrtPriceX96;
        tick = _tick;
    }

    function setSlot0(uint160 _sqrtPriceX96, int24 _tick) external {
        sqrtPriceX96 = _sqrtPriceX96;
        tick = _tick;
    }

    function slot0()
        external
        view
        returns (
            uint160,
            int24,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        )
    {
        return (sqrtPriceX96, tick, 0, 1, 1, 0, true);
    }
}
