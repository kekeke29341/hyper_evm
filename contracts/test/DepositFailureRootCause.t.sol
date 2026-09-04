// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {ProjectXPrice} from "../src/libraries/ProjectXPrice.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";

interface IERC20Minimal {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface IUniswapV3Pool {
    function tickSpacing() external view returns (int24);
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
}

contract DepositFailureRootCause is Test {
    address constant BROKEN_VAULT = 0xF749790D37cc125B6F5d2BC5a64B56577a26d394;
    address constant FIXED_VAULT = 0x03cF822d0192D687cBDc2fAe6B8492a27634aD99;
    address constant USDC = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;
    address constant POOL = 0x422e586C906eb241f784B4F5a633c2C7e59A2F54;
    address constant USER = 0xF35208BfAdc5f7d38334FD71f42FdDC7eeB85b55;

    function setUp() public {
        vm.createSelectFork("https://rpc.hyperliquid.xyz/evm");
    }

    function test_deployedMainnetDepositAlwaysReverts() public {
        vm.startPrank(USER);
        IERC20Minimal(USDC).approve(BROKEN_VAULT, 1_000_000);
        vm.expectRevert();
        HyperpoolVault(BROKEN_VAULT).depositUSDC(1_000_000, USER);
        vm.stopPrank();
    }

    function test_fixedMainnetVaultAcceptsDepositOnFork() public {
        vm.startPrank(USER);
        IERC20Minimal(USDC).approve(FIXED_VAULT, 1_000_000);
        uint256 shares = HyperpoolVault(FIXED_VAULT).depositUSDC(1_000_000, USER);
        assertGt(shares, 0);
        vm.stopPrank();
    }

    function test_tickSpacingTenLeavesUpperTickMisaligned() public pure {
        // Mirrors deployed bytecode: TICK_SPACING was 10 for legacy 0.05% pool.
        int24 spacingUsed = 10;
        int24 poolSpacing = 60;
        int24 upperMisaligned = -237990; // observed on mainnet fork with spacing 10
        assertEq(upperMisaligned % spacingUsed, 0);
        assertNotEq(upperMisaligned % poolSpacing, 0);
    }

    function test_tickSpacingSixtyAlignsTicksToPool() public view {
        // Fix for 0.3% pool: use live pool price like adapter.deposit() on first mint.
        uint256 price = 70745080793074858469; // currentPoolPriceUsdc6PerHype18 on fork
        (int24 lower, int24 upper) = ProjectXPrice.ticksFromRefPrice(
            price,
            false,
            1e30,
            ProjectXConstants.UPPER_RANGE_BPS,
            ProjectXConstants.LOWER_RANGE_BPS
        );
        int24 spacing = IUniswapV3Pool(POOL).tickSpacing();
        (, int24 currentTick,,,,,) = IUniswapV3Pool(POOL).slot0();

        assertEq(spacing, 60);
        assertEq(lower % spacing, 0);
        assertEq(upper % spacing, 0);
        assertTrue(currentTick > lower && currentTick < upper);
    }
}
