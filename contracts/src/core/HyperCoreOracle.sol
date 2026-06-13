// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {L1Read, Position, SpotBalance} from "../libraries/L1Read.sol";

/// @title HyperCoreOracle — on-chain HyperCore price / L1 state reader for HyperEVM
/// @dev Uses L1Read precompiles. Invalid asset IDs revert and burn call-frame gas — use try* in production UIs.
///      Oracle prices use HyperCore asset-specific decimals (e.g. perp/spot px often 8 decimals for USD pairs).
///      Always validate freshness via l1Block alongside price in consuming contracts.
contract HyperCoreOracle {
    event OracleRead(uint32 indexed assetId, uint256 price, uint64 l1Block);

    function getL1BlockNumber() external view returns (uint64) {
        return L1Read.l1BlockNumber();
    }

    function getOraclePrice(uint32 assetId) external view returns (uint256 price) {
        price = L1Read.oraclePx(assetId);
        require(price != 0, "HyperCoreOracle: ZERO_PRICE");
    }

    function tryGetOraclePrice(uint32 assetId) external view returns (uint256 price, bool ok) {
        (price, ok) = L1Read.tryOraclePx(assetId);
        if (ok && price == 0) ok = false;
    }

    function getPosition(address user, uint16 perp) external view returns (Position memory) {
        return L1Read.position(user, perp);
    }

    function getSpotBalance(address user, uint64 token) external view returns (SpotBalance memory) {
        return L1Read.spotBalance(user, token);
    }

    /// @notice Convenience helper: read oracle + L1 block in one call (for logging / sanity checks)
    function snapshotOracle(uint32 assetId) external returns (uint256 price, uint64 l1Block) {
        l1Block = L1Read.l1BlockNumber();
        price = L1Read.oraclePx(assetId);
        require(price != 0, "HyperCoreOracle: ZERO_PRICE");
        emit OracleRead(assetId, price, l1Block);
    }
}
