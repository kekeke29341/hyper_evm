// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockProjectXNPM} from "../src/mocks/MockProjectXNPM.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";
import {MockUniswapV3Pool} from "../src/mocks/MockUniswapV3Pool.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreOracle} from "../src/core/HyperCoreOracle.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";
import {ProjectXPrice} from "../src/libraries/ProjectXPrice.sol";

/// @dev Regression tests for the deposit/rebalance entry-price guard (finding #1) and the
///      rebalance anti-sandwich guard (finding #3). A HyperCore oracle is wired and a
///      configurable pool is attached so slot0 can be manipulated.
contract SecurityFixesTest is Test {
    MockERC20 whype;
    MockERC20 usdc;
    MockProjectXNPM npm;
    ProjectXAdapter adapter;
    HyperpoolVault vault;
    MerkleAirdrop airdrop;
    HyperCoreOracle oracle;
    MockUniswapV3Pool pool;

    address alice = makeAddr("alice");
    address attacker = makeAddr("attacker");
    address operator = makeAddr("operator");
    address protocolOwner = makeAddr("protocolOwner");

    // Oracle reports $42.0000 (4-decimal HyperCore px). Canonical vault scale = px * 1e14.
    uint256 constant ORACLE_PX4 = 42e4;
    uint256 constant PRICE_42 = 42e6 * 1e12; // $42 in USDC6-per-HYPE18 scale

    bool usdcIsToken0;

    function setUp() public {
        whype = new MockERC20("HYPE", "HYPE", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        npm = new MockProjectXNPM();
        airdrop = new MerkleAirdrop(address(usdc));
        oracle = new HyperCoreOracle();

        address token0 = address(whype) < address(usdc) ? address(whype) : address(usdc);
        address token1 = address(whype) < address(usdc) ? address(usdc) : address(whype);
        usdcIsToken0 = token0 == address(usdc);

        adapter = new ProjectXAdapter(
            address(npm), token0, token1, address(usdc), address(whype), ProjectXConstants.FEE_TIER_DEFAULT, address(this)
        );
        vault = new HyperpoolVault(
            address(adapter),
            address(oracle),
            HyperCoreConstants.HYPE_ORACLE_ASSET_ID,
            address(whype),
            address(usdc),
            address(airdrop),
            address(this),
            address(this),
            operator,
            protocolOwner
        );
        adapter.setVault(address(vault));

        MockSwapRouter router = new MockSwapRouter(PRICE_42);
        usdc.mint(address(router), 1_000_000e6);
        whype.mint(address(router), 1_000_000 ether);
        vault.setSwapRouter(address(router));

        // Pool starts at the oracle price so entry checks pass by default.
        pool = new MockUniswapV3Pool(_sqrt(PRICE_42), 0);
        adapter.setPool(address(pool));

        // Oracle precompile returns a fixed $42.
        vm.mockCall(
            HyperCoreConstants.PRECOMPILE_ORACLE_PX,
            abi.encode(uint32(HyperCoreConstants.HYPE_ORACLE_ASSET_ID)),
            abi.encode(ORACLE_PX4)
        );
    }

    function _sqrt(uint256 price) internal view returns (uint160) {
        return ProjectXPrice.sqrtPriceX96FromRefPrice(price, usdcIsToken0);
    }

    function _setSpot(uint256 price) internal {
        pool.setSlot0(_sqrt(price), 0);
    }

    // ---------------------------------------------------------------- #1

    function test_DepositSucceedsWhenSpotNearOracle() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(1000e6, alice);
        vm.stopPrank();
        assertGt(shares, 0);
    }

    /// @notice A depositor cannot mint against a spot price pushed far from the oracle.
    function test_DepositRevertsWhenSpotManipulatedUp() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice); // seed at sane price

        // Attacker pushes pool spot to ~$50 (19% above the $42 oracle, > 5% band).
        _setSpot(50e6 * 1e12);

        usdc.mint(attacker, 10_000e6);
        vm.startPrank(attacker);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert("HyperpoolVault: ENTRY_PRICE_DEVIATION");
        vault.depositUSDC(1000e6, attacker);
        vm.stopPrank();
    }

    function test_DepositRevertsWhenSpotManipulatedDown() public {
        _setSpot(34e6 * 1e12); // ~19% below oracle
        usdc.mint(attacker, 10_000e6);
        vm.startPrank(attacker);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert("HyperpoolVault: ENTRY_PRICE_DEVIATION");
        vault.depositUSDC(1000e6, attacker);
        vm.stopPrank();
    }

    /// @notice Guard lets deposits through again once the pool returns to a sane band.
    function test_DepositRecoversAfterSpotRestored() public {
        _setSpot(50e6 * 1e12);
        usdc.mint(attacker, 10_000e6);
        vm.startPrank(attacker);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert("HyperpoolVault: ENTRY_PRICE_DEVIATION");
        vault.depositUSDC(1000e6, attacker);

        _setSpot(PRICE_42);
        uint256 shares = vault.depositUSDC(1000e6, attacker);
        vm.stopPrank();
        assertGt(shares, 0);
    }

    function test_DepositHypeRevertsWhenSpotManipulated() public {
        _setSpot(50e6 * 1e12);
        whype.mint(attacker, 100 ether);
        vm.startPrank(attacker);
        whype.approve(address(vault), type(uint256).max);
        vm.expectRevert("HyperpoolVault: ENTRY_PRICE_DEVIATION");
        vault.depositHYPE(1 ether, attacker);
        vm.stopPrank();
    }

    /// @notice A small (<5%) spot move stays within the band and does not block deposits.
    function test_DepositAllowedWithinBand() public {
        _setSpot(43e6 * 1e12); // ~2.4% above oracle
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(1000e6, alice);
        vm.stopPrank();
        assertGt(shares, 0);
    }

    // ---------------------------------------------------------------- #3

    function test_RebalanceRevertsWhenSpotManipulated() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        _setSpot(50e6 * 1e12); // pool dislocated right before the keeper tx

        // Keeper price itself is within band of the oracle, but the live spot is not.
        vm.expectRevert("HyperpoolVault: ENTRY_PRICE_DEVIATION");
        vault.rebalance(PRICE_42);
    }

    function test_RebalanceSucceedsWhenSpotSane() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        // Spot stays near oracle; decrease-liquidity minimums are computed from the pool.
        int24 lowerBefore = adapter.tickLower();
        vault.rebalance(43e6 * 1e12);
        assertTrue(adapter.tickLower() != lowerBefore || adapter.tickUpper() != adapter.tickLower());
    }
}
