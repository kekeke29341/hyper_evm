// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";

contract ReferralRegistryTest is Test {
    ReferralRegistry registry;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        registry = new ReferralRegistry();
    }

    function test_RegisterAndBind() public {
        vm.prank(alice);
        registry.registerReferrer();

        vm.prank(bob);
        registry.bindReferrer(alice);

        assertTrue(registry.isRegisteredReferrer(alice));
        assertEq(registry.getReferrer(bob), alice);
        assertEq(registry.referralCount(alice), 1);
    }

    function test_RefereeBoostApplied() public {
        vm.prank(alice);
        registry.registerReferrer();
        vm.prank(bob);
        registry.bindReferrer(alice);

        uint256 base = 1000;
        uint256 boosted = registry.applyRefereeBoost(bob, base);
        assertEq(boosted, base + (base * 500) / 10_000);
    }

    function test_NoBoostWithoutReferrer() public view {
        assertEq(registry.applyRefereeBoost(bob, 1000), 1000);
    }

    function test_RevertSelfReferral() public {
        vm.prank(alice);
        registry.registerReferrer();

        vm.prank(alice);
        vm.expectRevert("ReferralRegistry: SELF_REFERRAL");
        registry.bindReferrer(alice);
    }

    function test_RevertDoubleRegistration() public {
        vm.startPrank(alice);
        registry.registerReferrer();
        vm.expectRevert("ReferralRegistry: ALREADY_REGISTERED");
        registry.registerReferrer();
        vm.stopPrank();
    }

    function test_RevertDoubleBind() public {
        vm.prank(alice);
        registry.registerReferrer();
        vm.prank(carol);
        registry.registerReferrer();

        vm.startPrank(bob);
        registry.bindReferrer(alice);
        vm.expectRevert("ReferralRegistry: ALREADY_BOUND");
        registry.bindReferrer(carol);
        vm.stopPrank();
    }

    function test_RevertInvalidReferrer() public {
        vm.prank(bob);
        vm.expectRevert("ReferralRegistry: INVALID_REFERRER");
        registry.bindReferrer(alice);
    }

    function test_RevertZeroReferrer() public {
        vm.prank(bob);
        vm.expectRevert("ReferralRegistry: ZERO_REFERRER");
        registry.bindReferrer(address(0));
    }

    function test_RevertMutualReferral() public {
        vm.prank(alice);
        registry.registerReferrer();
        vm.prank(bob);
        registry.registerReferrer();

        vm.prank(alice);
        registry.bindReferrer(bob);

        vm.prank(bob);
        vm.expectRevert("ReferralRegistry: MUTUAL_REFERRAL");
        registry.bindReferrer(alice);
    }
}
