// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";

/// @dev End-to-end pipeline: register → bind → getReferrer → cashdrop math alignment.
contract ReferralRegistryIntegrationTest is Test {
    ReferralRegistry registry;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant PENDING = 10_000;
    uint256 constant REFEREE_BOOST_BPS = 500;
    uint256 constant REFERRER_BONUS_BPS = 1500;

    function setUp() public {
        registry = new ReferralRegistry();
    }

    function test_FullPipeline_registerBindGetReferrer() public {
        vm.prank(alice);
        registry.registerReferrer();

        vm.prank(bob);
        registry.bindReferrer(alice);

        assertTrue(registry.isRegisteredReferrer(alice));
        assertFalse(registry.isRegisteredReferrer(bob));
        assertEq(registry.getReferrer(bob), alice);
        assertEq(registry.getReferrer(alice), address(0));
        assertEq(registry.referralCount(alice), 1);
    }

  /// @dev Mirrors scripts/lib/referral-allocation.mjs + daily-rewards.mjs cashdrop split.
    function test_CashdropSplitMatchesOffChainFormula() public {
        vm.prank(alice);
        registry.registerReferrer();
        vm.prank(bob);
        registry.bindReferrer(alice);

        uint256 base = PENDING;
        uint256 refereeBoost = registry.applyRefereeBoost(bob, base);
        uint256 commission = (base * REFERRER_BONUS_BPS) / 10_000;

        assertEq(refereeBoost, base + (base * REFEREE_BOOST_BPS) / 10_000);
        assertEq(commission, 1500);

        // Normalized to fixed pool: raw 10500 + 1500 = 12000 → scaled to 10000
        uint256 rawSum = refereeBoost + commission;
        uint256 refereePayout = (refereeBoost * PENDING) / rawSum;
        uint256 referrerPayout = PENDING - refereePayout;

        assertEq(refereePayout + referrerPayout, PENDING);
        assertEq(refereePayout, 8750);
        assertEq(referrerPayout, 1250);
    }

    function test_UnregisteredReferrerCannotBeBound() public {
        vm.prank(bob);
        vm.expectRevert("ReferralRegistry: INVALID_REFERRER");
        registry.bindReferrer(alice);
    }

    function test_ReferrerMustRegisterBeforeSharingLink() public {
        assertFalse(registry.isRegisteredReferrer(alice));
        vm.prank(bob);
        vm.expectRevert("ReferralRegistry: INVALID_REFERRER");
        registry.bindReferrer(alice);
    }
}
