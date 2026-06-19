// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ProjectXConstants — Project X on-chain addresses and strategy params
library ProjectXConstants {
    // HyperEVM mainnet (999)
    address internal constant NPM_MAINNET = 0xeaD19AE861c29bBb2101E834922B2FEee69B9091;
    address internal constant POOL_WHYPE_USDC_MAINNET = 0x6c9A33E3b592C0d65B3Ba59355d5Be0d38259285;
    address internal constant FACTORY_MAINNET = 0xFf7B3e8C00e57ea31477c32A5B52a58Eea47b072;

    uint24 internal constant FEE_TIER_500 = 500; // 0.05%

    uint256 internal constant UPPER_RANGE_BPS = 1000; // +10%
    uint256 internal constant LOWER_RANGE_BPS = 3000; // -30%
    uint256 internal constant OPERATOR_FEE_BPS = 3000; // 30%
    uint256 internal constant USER_FEE_BPS = 7000; // 70%

    uint256 internal constant BPS = 10_000;

    function npmForChain(uint256 chainId) internal pure returns (address) {
        if (chainId == 999) return NPM_MAINNET;
        return address(0);
    }

    function poolForChain(uint256 chainId) internal pure returns (address) {
        if (chainId == 999) return POOL_WHYPE_USDC_MAINNET;
        return address(0);
    }
}
