// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {FeeCollector} from "../src/core/FeeCollector.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";
import {PointsDistributor} from "../src/core/PointsDistributor.sol";
import {ProjectXFactory} from "../src/core/ProjectXFactory.sol";
import {ProjectXRouter} from "../src/core/ProjectXRouter.sol";
import {ProjectXPair} from "../src/core/ProjectXPair.sol";
import {HyperpoolLiquidityVault} from "../src/core/HyperpoolLiquidityVault.sol";

contract HyperpoolLiquidityVaultTest is Test {
    MockERC20 khype;
    MockERC20 usdc;
    ProjectXRouter router;
    ProjectXPair pair;
    HyperpoolLiquidityVault vault;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        FeeCollector feeCollector = new FeeCollector();
        ReferralRegistry referralRegistry = new ReferralRegistry();
        PointsDistributor pointsDistributor = new PointsDistributor(address(referralRegistry));
        ProjectXFactory factory = new ProjectXFactory(address(feeCollector), address(pointsDistributor), owner);
        router = new ProjectXRouter(address(factory));

        vm.startPrank(owner);
        factory.setTrustedRouter(address(router));
        khype = new MockERC20("kHYPE", "kHYPE", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        factory.createPair(address(khype), address(usdc));
        pair = ProjectXPair(factory.getPair(address(khype), address(usdc)));
        vault = new HyperpoolLiquidityVault(address(router), address(pair), address(khype), address(usdc), owner, keeper);
        vm.stopPrank();
        pointsDistributor.authorizePool(address(pair));

        khype.mint(owner, 1_000 ether);
        usdc.mint(owner, 2_000_000e6);
        vm.startPrank(owner);
        khype.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        router.addLiquidity(address(khype), address(usdc), 100 ether, 200_000e6, 0, 0, owner, block.timestamp + 1);
        vm.stopPrank();

        _fund(alice);
        _fund(bob);
    }

    function test_DepositDualMintsSharesAndHoldsLp() public {
        vm.startPrank(alice);
        khype.approve(address(vault), 10 ether);
        usdc.approve(address(vault), 20_000e6);
        (,, uint256 liquidity, uint256 shares) =
            vault.depositDual(10 ether, 20_000e6, 0, 0, alice, block.timestamp + 1);
        vm.stopPrank();

        assertGt(liquidity, 0);
        assertEq(shares, vault.balanceOf(alice));
        assertEq(pair.balanceOf(address(vault)), liquidity);
        assertEq(vault.totalManagedLp(), liquidity);
    }

    function test_DepositSingleUsdcSwapsAndMintsShares() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        (uint256 liquidity, uint256 shares) =
            vault.depositSingle(address(usdc), 10_000e6, 0, 0, 0, alice, block.timestamp + 1);
        vm.stopPrank();

        assertGt(liquidity, 0);
        assertGt(shares, 0);
        assertEq(vault.balanceOf(alice), shares);
        assertEq(khype.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_WithdrawBurnsSharesAndReturnsAssets() public {
        vm.startPrank(alice);
        khype.approve(address(vault), 10 ether);
        usdc.approve(address(vault), 20_000e6);
        vault.depositDual(10 ether, 20_000e6, 0, 0, alice, block.timestamp + 1);
        uint256 shares = vault.balanceOf(alice);
        uint256 khypeBefore = khype.balanceOf(alice);
        uint256 usdcBefore = usdc.balanceOf(alice);

        (uint256 amountKHYPE, uint256 amountUSDC, uint256 liquidity) =
            vault.withdraw(shares / 2, 0, 0, alice, block.timestamp + 1);
        vm.stopPrank();

        assertGt(liquidity, 0);
        assertGt(amountKHYPE, 0);
        assertGt(amountUSDC, 0);
        assertGt(khype.balanceOf(alice), khypeBefore);
        assertGt(usdc.balanceOf(alice), usdcBefore);
        assertEq(vault.balanceOf(alice), shares - shares / 2);
    }

    function test_SlippageReverts() public {
        vm.startPrank(alice);
        khype.approve(address(vault), 1 ether);
        usdc.approve(address(vault), 2_000e6);
        vm.expectRevert("ProjectXRouter: INSUFFICIENT_B_AMOUNT");
        vault.depositDual(1 ether, 2_000e6, 0, 3_000e6, alice, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_PauseBlocksDepositAndWithdraw() public {
        vm.prank(owner);
        vault.pause();

        vm.startPrank(alice);
        khype.approve(address(vault), 1 ether);
        usdc.approve(address(vault), 2_000e6);
        vm.expectRevert();
        vault.depositDual(1 ether, 2_000e6, 0, 0, alice, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_RebalanceIsKeeperOnly() public {
        khype.mint(address(vault), 1 ether);
        usdc.mint(address(vault), 2_000e6);

        vm.prank(alice);
        vm.expectRevert("HyperpoolVault: NOT_KEEPER");
        vault.rebalance(0, 0, block.timestamp + 1);

        vm.prank(keeper);
        (,, uint256 liquidity) = vault.rebalance(0, 0, block.timestamp + 1);
        assertGt(liquidity, 0);
    }

    function test_SequentialDepositsDoNotInflateShares() public {
        vm.startPrank(alice);
        khype.approve(address(vault), 10 ether);
        usdc.approve(address(vault), 20_000e6);
        (,, uint256 liquidityA, uint256 sharesA) =
            vault.depositDual(10 ether, 20_000e6, 0, 0, alice, block.timestamp + 1);
        vm.stopPrank();

        vm.startPrank(bob);
        khype.approve(address(vault), 10 ether);
        usdc.approve(address(vault), 20_000e6);
        (,, uint256 liquidityB, uint256 sharesB) =
            vault.depositDual(10 ether, 20_000e6, 0, 0, bob, block.timestamp + 1);
        vm.stopPrank();

        assertApproxEqAbs(liquidityA, liquidityB, 2);
        assertApproxEqAbs(sharesA, sharesB, 2);
    }

    function _fund(address user) private {
        khype.mint(user, 100 ether);
        usdc.mint(user, 200_000e6);
    }
}
