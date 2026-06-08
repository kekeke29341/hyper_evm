// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HyperCoreConstants} from "./HyperCoreConstants.sol";

/// @notice A user's perpetual futures position on HyperCore.
struct Position {
    int64 szi;
    uint64 entryNtl;
    int64 isolatedRawUsd;
    uint32 leverage;
    bool isIsolated;
}

/// @notice A user's spot token balance on HyperCore.
struct SpotBalance {
    uint64 total;
    uint64 hold;
    uint64 entryNtl;
}

error L1BlockNumberPrecompileCallFailed();
error OraclePxPrecompileCallFailed();
error PositionPrecompileCallFailed();
error SpotBalancePrecompileCallFailed();

/// @title L1Read — HyperCore read precompiles via staticcall
/// @dev Values match HyperCore state at EVM block construction.
///      Gas formula: 2000 + 65 * (input_len + output_len).
///      See https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore
library L1Read {
    uint256 private constant ORACLE_PX_GAS = 7500;
    uint256 private constant L1_BLOCK_NUMBER_GAS = 5000;
    uint256 private constant POSITION_GAS = 20_000;
    uint256 private constant SPOT_BALANCE_GAS = 15_000;

    function l1BlockNumber() internal view returns (uint64) {
        (uint64 result, bool success) = tryL1BlockNumber();
        if (!success) revert L1BlockNumberPrecompileCallFailed();
        return result;
    }

    function tryL1BlockNumber() internal view returns (uint64 result, bool success) {
        (bool ok, bytes memory data) =
            HyperCoreConstants.PRECOMPILE_L1_BLOCK.staticcall{gas: L1_BLOCK_NUMBER_GAS}("");
        if (!ok) return (result, false);
        return (abi.decode(data, (uint64)), true);
    }

    function oraclePx(uint32 assetId) internal view returns (uint256) {
        (uint256 result, bool success) = tryOraclePx(assetId);
        if (!success) revert OraclePxPrecompileCallFailed();
        return result;
    }

    function tryOraclePx(uint32 assetId) internal view returns (uint256 result, bool success) {
        (bool ok, bytes memory data) = HyperCoreConstants.PRECOMPILE_ORACLE_PX.staticcall{gas: ORACLE_PX_GAS}(
            abi.encode(assetId)
        );
        if (!ok) return (result, false);
        return (abi.decode(data, (uint256)), true);
    }

    function position(address user, uint16 perp) internal view returns (Position memory) {
        (Position memory result, bool success) = tryPosition(user, perp);
        if (!success) revert PositionPrecompileCallFailed();
        return result;
    }

    function tryPosition(address user, uint16 perp) internal view returns (Position memory result, bool success) {
        (bool ok, bytes memory data) = HyperCoreConstants.PRECOMPILE_POSITION.staticcall{gas: POSITION_GAS}(
            abi.encode(user, perp)
        );
        if (!ok) return (result, false);
        return (abi.decode(data, (Position)), true);
    }

    function spotBalance(address user, uint64 token) internal view returns (SpotBalance memory) {
        (SpotBalance memory result, bool success) = trySpotBalance(user, token);
        if (!success) revert SpotBalancePrecompileCallFailed();
        return result;
    }

    function trySpotBalance(address user, uint64 token)
        internal
        view
        returns (SpotBalance memory result, bool success)
    {
        (bool ok, bytes memory data) = HyperCoreConstants.PRECOMPILE_SPOT_BALANCE.staticcall{gas: SPOT_BALANCE_GAS}(
            abi.encode(user, token)
        );
        if (!ok) return (result, false);
        return (abi.decode(data, (SpotBalance)), true);
    }
}
