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

/// @dev Regression tests for security review N-1 (2026-06-15)
contract PointsDistributorTest is Test {
    PointsDistributor pointsDistributor;
    ProjectXPair pair;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        FeeCollector feeCollector = new FeeCollector();
        ReferralRegistry referralRegistry = new ReferralRegistry();
        pointsDistributor = new PointsDistributor(address(referralRegistry));
        ProjectXFactory factory = new ProjectXFactory(address(feeCollector), address(pointsDistributor), address(this));
        ProjectXRouter router = new ProjectXRouter(address(factory));
        factory.setTrustedRouter(address(router));

        MockERC20 tokenA = new MockERC20("kHYPE", "kHYPE", 18);
        MockERC20 tokenB = new MockERC20("USDC", "USDC", 6);
        factory.createPair(address(tokenA), address(tokenB));
        pair = ProjectXPair(factory.getPair(address(tokenA), address(tokenB)));
        pointsDistributor.authorizePool(address(pair));
    }

    function test_FirstContributorDoesNotDrainPoolOnClaim() public {
        uint256 epoch = pointsDistributor.currentEpoch();
        vm.prank(address(pair));
        pointsDistributor.recordFeeContribution(address(pair), alice, 1);

        assertEq(pointsDistributor.getUserPoints(alice), 0);
        assertEq(pointsDistributor.previewEpochPoints(epoch, alice), pointsDistributor.DAILY_POOL());

        vm.warp(block.timestamp + pointsDistributor.EPOCH_DURATION() + 1);
        vm.prank(alice);
        pointsDistributor.claimEpochPoints(epoch);

        assertEq(pointsDistributor.epochBasePointsDistributed(epoch), pointsDistributor.DAILY_POOL());
        assertEq(pointsDistributor.getUserPoints(alice), pointsDistributor.DAILY_POOL());
    }

    function test_EpochPointsNeverExceedPool() public {
        uint256 epoch = pointsDistributor.currentEpoch();

        vm.startPrank(address(pair));
        pointsDistributor.recordFeeContribution(address(pair), alice, 100);
        pointsDistributor.recordFeeContribution(address(pair), bob, 300);
        vm.stopPrank();

        vm.warp(block.timestamp + pointsDistributor.EPOCH_DURATION() + 1);

        vm.prank(alice);
        pointsDistributor.claimEpochPoints(epoch);
        vm.prank(bob);
        pointsDistributor.claimEpochPoints(epoch);

        uint256 totalBase = pointsDistributor.epochBasePointsDistributed(epoch);
        assertEq(totalBase, pointsDistributor.DAILY_POOL());

        uint256 alicePoints = pointsDistributor.getUserPoints(alice);
        uint256 bobPoints = pointsDistributor.getUserPoints(bob);
        assertEq(alicePoints + bobPoints, totalBase);
        assertApproxEqAbs(alicePoints, pointsDistributor.DAILY_POOL() / 4, 1);
        assertApproxEqAbs(bobPoints, (pointsDistributor.DAILY_POOL() * 3) / 4, 1);
    }

    function test_AutoClaimOnNextContribution() public {
        uint256 epoch = pointsDistributor.currentEpoch();
        vm.prank(address(pair));
        pointsDistributor.recordFeeContribution(address(pair), alice, 50);

        vm.warp(block.timestamp + pointsDistributor.EPOCH_DURATION() + 1);

        vm.prank(address(pair));
        pointsDistributor.recordFeeContribution(address(pair), alice, 1);

        assertGt(pointsDistributor.getUserPoints(alice), 0);
        assertTrue(pointsDistributor.epochPointsClaimed(epoch, alice));
    }
}
