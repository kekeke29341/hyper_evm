// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";

contract ReferralRegistryTest is Test {
    ReferralRegistry registry;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    bytes32 constant CODE = keccak256("XM79B4");

    function setUp() public {
        registry = new ReferralRegistry();
    }

    function test_RegisterAndBind() public {
        vm.prank(alice);
        registry.registerCode(CODE);

        vm.prank(bob);
        registry.enterInvitationCode(CODE);

        assertEq(registry.getReferrer(bob), alice);
        assertEq(registry.referralCount(alice), 1);
    }

    function test_RefereeBoostApplied() public {
        vm.prank(alice);
        registry.registerCode(CODE);
        vm.prank(bob);
        registry.enterInvitationCode(CODE);

        uint256 base = 1000;
        uint256 boosted = registry.applyRefereeBoost(bob, base);
        assertEq(boosted, base + (base * 1000) / 10_000);
    }

    function test_NoBoostWithoutReferrer() public view {
        assertEq(registry.applyRefereeBoost(bob, 1000), 1000);
    }

    function test_RevertSelfReferral() public {
        vm.prank(alice);
        registry.registerCode(CODE);

        vm.prank(alice);
        vm.expectRevert("ReferralRegistry: SELF_REFERRAL");
        registry.enterInvitationCode(CODE);
    }

    function test_RevertDuplicateCode() public {
        vm.prank(alice);
        registry.registerCode(CODE);

        vm.prank(bob);
        vm.expectRevert("ReferralRegistry: CODE_TAKEN");
        registry.registerCode(CODE);
    }

    function test_RevertDoubleRegistration() public {
        bytes32 code2 = keccak256("OTHER");
        vm.startPrank(alice);
        registry.registerCode(CODE);
        vm.expectRevert("ReferralRegistry: ALREADY_REGISTERED");
        registry.registerCode(code2);
        vm.stopPrank();
    }

    function test_RevertDoubleBind() public {
        bytes32 code2 = keccak256("OTHER2");
        vm.prank(alice);
        registry.registerCode(CODE);
        vm.prank(carol);
        registry.registerCode(code2);

        vm.startPrank(bob);
        registry.enterInvitationCode(CODE);
        vm.expectRevert("ReferralRegistry: ALREADY_BOUND");
        registry.enterInvitationCode(code2);
        vm.stopPrank();
    }

    function test_RevertInvalidCode() public {
        vm.prank(bob);
        vm.expectRevert("ReferralRegistry: INVALID_CODE");
        registry.enterInvitationCode(CODE);
    }
}
