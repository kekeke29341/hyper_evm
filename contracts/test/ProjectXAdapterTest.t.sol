// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockProjectXNPM} from "../src/mocks/MockProjectXNPM.sol";
import {MockUniswapV3Pool} from "../src/mocks/MockUniswapV3Pool.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {TickMath} from "../src/libraries/TickMath.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";
import {ProjectXPrice} from "../src/libraries/ProjectXPrice.sol";

contract ProjectXAdapterTest is Test {
    MockERC20 whype;
    MockERC20 usdc;
    MockProjectXNPM npm;
    ProjectXAdapter adapter;
    HyperpoolVault vault;

    address user = makeAddr("user");

    function setUp() public {
        whype = new MockERC20("HYPE", "HYPE", 18);
        usdc = new MockERC20("USDC", "USDC", 6);

        npm = new MockProjectXNPM();
        address token0 = address(whype) < address(usdc) ? address(whype) : address(usdc);
        address token1 = address(whype) < address(usdc) ? address(usdc) : address(whype);

        adapter = new ProjectXAdapter(
            address(npm),
            token0,
            token1,
            address(usdc),
            address(whype),
            ProjectXConstants.FEE_TIER_DEFAULT,
            42e6 * 1e12,
            address(this)
        );

        vault = new HyperpoolVault(
            address(adapter),
            address(0),
            0,
            address(whype),
            address(usdc),
            makeAddr("airdrop"),
            address(this),
            address(this),
            address(this),
            address(this)
        );
        adapter.setVault(address(vault));
    }

    function test_OnlyVaultCanDeposit() public {
        usdc.mint(user, 1000e6);
        vm.startPrank(user);
        usdc.approve(address(adapter), type(uint256).max);
        vm.expectRevert("ProjectXAdapter: NOT_VAULT");
        adapter.deposit(1000e6, 0);
        vm.stopPrank();
    }

    function test_TotalAssetsUsdcUsesPoolNotSharedNpmBalances() public {
        uint256 price = 42e6 * 1e12;

        usdc.mint(address(vault), 1000e6);
        vm.startPrank(address(vault));
        usdc.transfer(address(adapter), 1000e6);
        adapter.deposit(1000e6, 0);
        vm.stopPrank();

        int24 midTick = (adapter.tickLower() + adapter.tickUpper()) / 2;
        adapter.setPool(address(new MockUniswapV3Pool(TickMath.getSqrtRatioAtTick(midTick), midTick)));

        uint256 navBefore = adapter.totalAssetsUsdc(price);

        usdc.mint(address(npm), 5000e6);
        whype.mint(address(npm), 100 ether);

        uint256 navAfter = adapter.totalAssetsUsdc(price);
        assertEq(navAfter, navBefore, "Pool-based NAV must ignore unrelated NPM balances");
    }

    function test_CurrentPoolPriceTracksSlot0() public {
        uint256 price = 67e6 * 1e12;
        bool usdcIsToken0 = address(adapter.token0()) == address(usdc);
        uint160 sqrtPrice = ProjectXPrice.sqrtPriceX96FromRefPrice(price, usdcIsToken0, 1e30);
        adapter.setPool(address(new MockUniswapV3Pool(sqrtPrice, 0)));

        assertApproxEqRel(adapter.currentPoolPriceUsdc6PerHype18(), price, 1e12);
    }

    function test_WithdrawProRataTransfersMockWithdrawnBalancesToVault() public {
        usdc.mint(address(vault), 1000e6);
        whype.mint(address(vault), 10 ether);

        vm.startPrank(address(vault));
        usdc.transfer(address(adapter), 1000e6);
        whype.transfer(address(adapter), 10 ether);
        adapter.deposit(
            address(adapter.token0()) == address(usdc) ? 1000e6 : 10 ether,
            address(adapter.token0()) == address(usdc) ? 10 ether : 1000e6
        );

        uint256 usdcBefore = usdc.balanceOf(address(vault));
        uint256 whypeBefore = whype.balanceOf(address(vault));
        adapter.withdrawProRata(1, 2);
        vm.stopPrank();

        assertGt(usdc.balanceOf(address(vault)), usdcBefore);
        assertGt(whype.balanceOf(address(vault)), whypeBefore);
    }

    function test_RebalanceCollectsCreditedNpmWithdrawalsBeforeRemint() public {
        npm.setCreditWithdrawals(true);

        usdc.mint(address(vault), 1000e6);
        whype.mint(address(vault), 10 ether);

        vm.startPrank(address(vault));
        usdc.transfer(address(adapter), 1000e6);
        whype.transfer(address(adapter), 10 ether);
        adapter.deposit(
            address(adapter.token0()) == address(usdc) ? 1000e6 : 10 ether,
            address(adapter.token0()) == address(usdc) ? 10 ether : 1000e6
        );

        uint256 oldId = adapter.positionTokenId();
        adapter.rebalance(50e6 * 1e12);
        vm.stopPrank();

        uint256 newId = adapter.positionTokenId();
        assertGt(newId, oldId);
        (,,,,,,, uint128 newLiq,,,,) = npm.positions(newId);
        assertGt(newLiq, 0);
    }

    function test_CollectFeesMapsUsdcAndHype() public {
        usdc.mint(address(vault), 1000e6);
        vm.startPrank(address(vault));
        usdc.transfer(address(adapter), 1000e6);
        adapter.deposit(1000e6, 0);

        uint256 tokenId = adapter.positionTokenId();
        npm.accrueFees(tokenId, 100e6, 1e17);
        (uint256 amount0, uint256 amount1) = adapter.collectFees();
        vm.stopPrank();

        if (address(adapter.token0()) == address(usdc)) {
            assertEq(amount0, 100e6);
            assertEq(amount1, 1e17);
        } else {
            assertEq(amount1, 100e6);
            assertEq(amount0, 1e17);
        }
    }

    function test_RangeDepositRatioUsesLivePriceWhenNoPosition() public {
        uint256 livePrice = 67e6 * 1e12;
        bool usdcIsToken0 = address(adapter.token0()) == address(usdc);

        uint160 liveSqrt = ProjectXPrice.sqrtPriceX96FromRefPrice(livePrice, usdcIsToken0, 1e30);
        adapter.setPool(address(new MockUniswapV3Pool(liveSqrt, TickMath.getTickAtSqrtRatio(liveSqrt))));

        // Constructor seeds refPrice at $42 while pool spot is $67.
        assertEq(adapter.refPriceUsdc6PerHype18(), 42e6 * 1e12);

        (uint256 token0Bps, uint256 token1Bps) = adapter.rangeDepositRatioBps();
        assertEq(token0Bps + token1Bps, ProjectXConstants.BPS);
        assertGt(token0Bps, 0, "in-range live price must require HYPE side");
        assertGt(token1Bps, 0, "in-range live price must require USDC side");
        assertLt(token0Bps, ProjectXConstants.BPS, "must not be 100% one-sided in-range");
    }

    function test_PositionTokenAmountsReflectsNpmLiquidity() public {
        usdc.mint(address(vault), 1000e6);
        whype.mint(address(vault), 10 ether);
        vm.startPrank(address(vault));
        usdc.transfer(address(adapter), 1000e6);
        whype.transfer(address(adapter), 10 ether);
        adapter.deposit(
            address(adapter.token0()) == address(usdc) ? 1000e6 : 10 ether,
            address(adapter.token0()) == address(usdc) ? 10 ether : 1000e6
        );
        vm.stopPrank();

        int24 midTick = (adapter.tickLower() + adapter.tickUpper()) / 2;
        adapter.setPool(address(new MockUniswapV3Pool(TickMath.getSqrtRatioAtTick(midTick), midTick)));

        (uint256 amount0, uint256 amount1) = adapter.positionTokenAmounts();
        assertGt(amount0 + amount1, 0, "position amounts should be non-zero");
    }

    /// Rescue path for fees stranded on abandoned NFTs from past rebalances: the owner can
    /// collect them to the vault (never to the owner wallet).
    function test_CollectFromTokenRescuesStrandedFeesToVault() public {
        usdc.mint(address(vault), 1000e6);
        vm.startPrank(address(vault));
        usdc.transfer(address(adapter), 1000e6);
        adapter.deposit(
            address(adapter.token0()) == address(usdc) ? 1000e6 : 0,
            address(adapter.token0()) == address(usdc) ? 0 : 1000e6
        );
        uint256 oldId = adapter.positionTokenId();
        adapter.rebalance(50e6 * 1e12);
        vm.stopPrank();

        assertGt(adapter.positionTokenId(), oldId);

        // Simulate fees that were stranded on the abandoned NFT
        npm.accrueFees(oldId, 5e6, 0);

        uint256 vaultUsdcBefore = usdc.balanceOf(address(vault));
        adapter.collectFromToken(oldId);
        assertEq(usdc.balanceOf(address(vault)) - vaultUsdcBefore, 5e6, "stranded fees rescued to vault");

        // Cannot target the active position and only the owner can call it
        uint256 activeId = adapter.positionTokenId();
        vm.expectRevert("ProjectXAdapter: ACTIVE_POSITION");
        adapter.collectFromToken(activeId);

        vm.prank(user);
        vm.expectRevert();
        adapter.collectFromToken(oldId);
    }

    function test_RangeDepositRatioBpsSumsToFullRange() public {
        uint256 price = 42e6 * 1e12;
        bool usdcIsToken0 = address(adapter.token0()) == address(usdc);
        uint160 sqrtPrice = ProjectXPrice.sqrtPriceX96FromRefPrice(price, usdcIsToken0, 1e30);
        adapter.setPool(address(new MockUniswapV3Pool(sqrtPrice, 0)));

        usdc.mint(address(vault), 1000e6);
        vm.startPrank(address(vault));
        usdc.transfer(address(adapter), 1000e6);
        adapter.deposit(address(adapter.token0()) == address(usdc) ? 1000e6 : 0, 0);
        vm.stopPrank();

        (uint256 token0Bps, uint256 token1Bps) = adapter.rangeDepositRatioBps();
        assertEq(token0Bps + token1Bps, ProjectXConstants.BPS);
        assertGt(token0Bps, 0);
        assertGt(token1Bps, 0);
    }
}
