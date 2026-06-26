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
            ProjectXConstants.FEE_TIER_500,
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
        uint160 sqrtPrice = ProjectXPrice.sqrtPriceX96FromRefPrice(price, usdcIsToken0);
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
}
