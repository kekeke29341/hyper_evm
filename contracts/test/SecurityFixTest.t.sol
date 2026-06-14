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
import {PoolMath} from "../src/libraries/PoolMath.sol";

/// @dev Regression tests for security review findings (2026-06-12)
contract SecurityFixTest is Test {
    MockERC20 tokenA;
    MockERC20 tokenB;
    FeeCollector feeCollector;
    ReferralRegistry referralRegistry;
    PointsDistributor pointsDistributor;
    ProjectXFactory factory;
    ProjectXRouter router;
    ProjectXPair pair;
    bool tokenAIsToken0;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address victim = makeAddr("victim");
    address attacker = makeAddr("attacker");

    function setUp() public {
        feeCollector = new FeeCollector();
        referralRegistry = new ReferralRegistry();
        pointsDistributor = new PointsDistributor(address(referralRegistry));
        factory = new ProjectXFactory(address(feeCollector), address(pointsDistributor), address(this));
        router = new ProjectXRouter(address(factory));
        factory.setTrustedRouter(address(router));

        tokenA = new MockERC20("kHYPE", "kHYPE", 18);
        tokenB = new MockERC20("USDC", "USDC", 6);

        factory.createPair(address(tokenA), address(tokenB));
        pair = ProjectXPair(factory.getPair(address(tokenA), address(tokenB)));
        tokenAIsToken0 = pair.token0() == address(tokenA);
        pointsDistributor.authorizePool(address(pair));

        tokenA.mint(alice, 1000 ether);
        tokenB.mint(alice, 1_000_000e6);
        vm.startPrank(alice);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), 100 ether, 200_000e6, 0, 0, alice, block.timestamp + 1);
        vm.stopPrank();
    }

    /// C-1: remove liquidity must succeed after swaps accrue protocol fees
    function test_RemoveLiquidityAfterSwapWithFees() public {
        tokenA.mint(bob, 5 ether);
        vm.startPrank(bob);
        tokenA.approve(address(router), type(uint256).max);
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        router.swapExactTokensForTokens(1 ether, 0, path, bob, block.timestamp + 1);
        vm.stopPrank();

        uint256 lp = pair.balanceOf(alice);
        vm.startPrank(alice);
        pair.transfer(address(pair), lp / 2);
        (uint256 amount0, uint256 amount1) = pair.burn(alice);
        vm.stopPrank();

        assertGt(amount0, 0);
        assertGt(amount1, 0);
    }

    /// H-1: direct swap must not bypass LP fee (K check enforces full swap fee)
    function _swapTokenAForB(uint256 amountOut, address to, address origin) internal {
        if (tokenAIsToken0) {
            pair.swap(0, amountOut, to, origin, "");
        } else {
            pair.swap(amountOut, 0, to, origin, "");
        }
    }

    function test_DirectSwapCannotBypassLpFee() public {
        tokenA.mint(attacker, 10 ether);
        vm.startPrank(attacker);
        tokenA.transfer(address(pair), 1 ether);

        (uint256 r0, uint256 r1) = pair.getReserves();
        uint256 reserveIn = tokenAIsToken0 ? r0 : r1;
        uint256 reserveOut = tokenAIsToken0 ? r1 : r0;
        uint256 fairOut = PoolMath.getAmountOut(1 ether, reserveIn, reserveOut, PoolMath.SWAP_FEE_BPS);
        uint256 greedyOut = fairOut + 1;

        vm.expectRevert("ProjectXPair: K");
        _swapTokenAForB(greedyOut, attacker, attacker);
        vm.stopPrank();
    }

    /// H-2: direct swap with spoofed origin must not assign points
    function test_DirectSwapSpoofsPointsOrigin() public {
        tokenA.mint(attacker, 5 ether);
        vm.startPrank(attacker);
        tokenA.transfer(address(pair), 1 ether);

        (uint256 r0, uint256 r1) = pair.getReserves();
        uint256 reserveIn = tokenAIsToken0 ? r0 : r1;
        uint256 reserveOut = tokenAIsToken0 ? r1 : r0;
        uint256 amountOut = PoolMath.getAmountOut(1 ether, reserveIn, reserveOut, PoolMath.SWAP_FEE_BPS);
        _swapTokenAForB(amountOut, attacker, victim);
        vm.stopPrank();

        assertEq(pointsDistributor.getUserPoints(victim), 0);
        assertEq(pointsDistributor.getUserPoints(attacker), 0);
    }

    /// Router swap assigns points to trader
    function test_RouterSwapRecordsPointsForTrader() public {
        tokenA.mint(bob, 5 ether);
        vm.startPrank(bob);
        tokenA.approve(address(router), type(uint256).max);
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        router.swapExactTokensForTokens(1 ether, 0, path, bob, block.timestamp + 1);
        vm.stopPrank();

        uint256 epoch = pointsDistributor.currentEpoch();
        vm.warp(block.timestamp + pointsDistributor.EPOCH_DURATION() + 1);
        vm.prank(bob);
        pointsDistributor.claimEpochPoints(epoch);

        assertGt(pointsDistributor.getUserPoints(bob), 0);
    }

    function test_MutualReferralRejected() public {
        bytes32 codeA = keccak256("CODE_A");
        bytes32 codeB = keccak256("CODE_B");
        vm.prank(alice);
        referralRegistry.registerCode(codeA);
        vm.prank(bob);
        referralRegistry.registerCode(codeB);

        vm.prank(alice);
        referralRegistry.enterInvitationCode(codeB);

        vm.prank(bob);
        vm.expectRevert("ReferralRegistry: MUTUAL_REFERRAL");
        referralRegistry.enterInvitationCode(codeA);
    }
}
