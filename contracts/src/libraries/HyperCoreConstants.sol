// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HyperCoreConstants — HyperEVM precompile and system addresses
/// @dev Small blocks: 3M gas (~1s). Big blocks: 30M gas (~1min).
library HyperCoreConstants {
    address internal constant CORE_WRITER = 0x3333333333333333333333333333333333333333;
    address internal constant HYPE_SYSTEM = 0x2222222222222222222222222222222222222222;
    address internal constant WHYPE = 0x5555555555555555555555555555555555555555;

    // Read precompiles (0x800–0x813)
    address internal constant PRECOMPILE_POSITION = 0x0000000000000000000000000000000000000800;
    address internal constant PRECOMPILE_SPOT_BALANCE = 0x0000000000000000000000000000000000000801;
    address internal constant PRECOMPILE_ORACLE_PX = 0x0000000000000000000000000000000000000807;
    address internal constant PRECOMPILE_L1_BLOCK = 0x0000000000000000000000000000000000000809;

    uint256 internal constant CHAIN_ID_TESTNET = 998;
    uint256 internal constant CHAIN_ID_MAINNET = 999;

    /// @dev HyperCore perp index for HYPE/USD oracle (4-decimal USD price per 1 HYPE)
    uint32 internal constant HYPE_ORACLE_ASSET_ID = 159;

    /// @dev Max rebalance price deviation from oracle (5%)
    uint256 internal constant DEFAULT_REBALANCE_DEVIATION_BPS = 500;

    uint256 internal constant SMALL_BLOCK_GAS_LIMIT = 3_000_000;
    uint256 internal constant BIG_BLOCK_GAS_LIMIT = 30_000_000;

    address internal constant USDC_TESTNET = 0x2B3370eE501B4a559b57D449569354196457D8Ab;
    address internal constant USDC_MAINNET = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;

    uint8 internal constant ACTION_VERSION = 1;
    uint24 internal constant ACTION_LIMIT_ORDER = 1;

    function usdcForChain(uint256 chainId) internal pure returns (address) {
        if (chainId == CHAIN_ID_TESTNET) return USDC_TESTNET;
        if (chainId == CHAIN_ID_MAINNET) return USDC_MAINNET;
        revert("HyperCoreConstants: UNSUPPORTED_CHAIN");
    }

    /// @dev WHYPE is the canonical wrapped HYPE ERC20 on HyperEVM (same address testnet + mainnet)
    function khypeForChain(uint256 chainId) internal pure returns (address) {
        if (chainId == CHAIN_ID_TESTNET || chainId == CHAIN_ID_MAINNET) return WHYPE;
        revert("HyperCoreConstants: UNSUPPORTED_CHAIN");
    }
}
