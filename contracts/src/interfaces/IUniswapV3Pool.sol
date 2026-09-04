// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IUniswapV3Pool — minimal view interface for position valuation
interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    /// @notice Cumulative tick and liquidity data, for TWAP-based price sanity checks.
    /// @dev Reverts ("OLD") when the pool lacks observations older than the oldest requested
    ///      `secondsAgo`; callers must handle that (fail-open or revert) via try/catch.
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);

    /// @notice Grow the observation ring buffer so a TWAP window becomes queryable.
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;

    /// @notice Pool identity, used to verify the adapter is wired to the intended pool.
    /// @dev Mock pools may return zero/unset values; callers treat that as "unverifiable".
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    /// @dev ProjectXPrice aligns ticks to a spacing of 60 (the 0.3% tier). A pool on another tier
    ///      would produce unaligned ticks and a reverting mint.
    function tickSpacing() external view returns (int24);
}
