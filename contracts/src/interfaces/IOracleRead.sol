// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Oracle price precompile at 0x807
interface IOracleRead {
    function oraclePx(uint32 assetId) external view returns (uint256 price);
}
