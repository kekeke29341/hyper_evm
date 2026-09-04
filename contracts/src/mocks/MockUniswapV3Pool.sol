// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV3Pool} from "../interfaces/IUniswapV3Pool.sol";

/// @title MockUniswapV3Pool — configurable slot0 for adapter NAV tests
contract MockUniswapV3Pool is IUniswapV3Pool {
    uint160 public sqrtPriceX96;
    int24 public tick;

    // TWAP simulation: observe() reports a time-weighted average tick of `twapTick`.
    // Defaults to `tick` (spot == TWAP) until setTwapTick is called.
    int24 public twapTick;
    bool private twapTickSet;
    // Simulate a pool without enough observation history / cardinality (real pools revert "OLD").
    bool public observeReverts;
    uint16 public observationCardinalityNext = 1;

    // Pool identity for ProjectXAdapter.setPool()'s wiring guard. token0 == address(0) means
    // "unset", which the guard reads as unverifiable and skips — the default for tests that only
    // care about slot0. setIdentity() opts a test into the guard.
    address public token0;
    address public token1;
    uint24 public fee;
    int24 public tickSpacing = 60;

    constructor(uint160 _sqrtPriceX96, int24 _tick) {
        sqrtPriceX96 = _sqrtPriceX96;
        tick = _tick;
    }

    function setIdentity(address _token0, address _token1, uint24 _fee, int24 _tickSpacing) external {
        token0 = _token0;
        token1 = _token1;
        fee = _fee;
        tickSpacing = _tickSpacing;
    }

    function setSlot0(uint160 _sqrtPriceX96, int24 _tick) external {
        sqrtPriceX96 = _sqrtPriceX96;
        tick = _tick;
    }

    function setTwapTick(int24 _twapTick) external {
        twapTick = _twapTick;
        twapTickSet = true;
    }

    function setObserveReverts(bool _reverts) external {
        observeReverts = _reverts;
    }

    function slot0()
        external
        view
        returns (
            uint160,
            int24,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext_,
            uint8 feeProtocol,
            bool unlocked
        )
    {
        return (sqrtPriceX96, tick, 0, 1, observationCardinalityNext, 0, true);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        require(!observeReverts, "OLD");
        int56 tw = int56(twapTickSet ? twapTick : tick);
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
        // cumulative(secondsAgo) = −tw * secondsAgo, so for any window W the reported average tick
        // (cum[at 0] − cum[at W]) / W == tw.
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            tickCumulatives[i] = -tw * int56(int32(secondsAgos[i]));
        }
    }

    function increaseObservationCardinalityNext(uint16 _next) external {
        if (_next > observationCardinalityNext) observationCardinalityNext = _next;
    }
}
