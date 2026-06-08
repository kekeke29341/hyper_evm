// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Position, SpotBalance} from "../libraries/L1Read.sol";

/// @title IL1Read — HyperEVM read precompile reference interface
/// @dev Precompiles are invoked via the `L1Read` library (staticcall), not as deployable contracts.
///      Addresses are defined in `HyperCoreConstants`.
///      Official docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore
interface IL1Read {
    /// @notice 0x809 — latest HyperCore L1 block number (no calldata)
    function l1BlockNumber() external view returns (uint64);

    /// @notice 0x807 — oracle price for perp asset index
    function oraclePx(uint32 assetId) external view returns (uint256 price);

    /// @notice 0x800 — perp position for user + 16-bit index
    function position(address user, uint16 perp) external view returns (Position memory);

    /// @notice 0x801 — spot balance for user + token index
    function spotBalance(address user, uint64 token) external view returns (SpotBalance memory);
}
