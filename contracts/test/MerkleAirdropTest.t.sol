// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract MerkleAirdropTest is Test {
    MockERC20 token;
    MerkleAirdrop airdrop;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address owner = address(this);

    uint256 constant ALICE_AMOUNT = 1000e6;
    uint256 constant BOB_AMOUNT = 500e6;

    function setUp() public {
        token = new MockERC20("USDC", "USDC", 6);
        airdrop = new MerkleAirdrop(address(token));
        token.mint(owner, 10_000e6);
        token.approve(address(airdrop), type(uint256).max);
    }

    function _leaf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    function _root(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function test_ClaimWithValidProof() public {
        bytes32 leafAlice = _leaf(alice, ALICE_AMOUNT);
        bytes32 leafBob = _leaf(bob, BOB_AMOUNT);
        bytes32 root = _root(leafAlice, leafBob);

        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT + BOB_AMOUNT);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leafBob;

        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, proof);

        assertEq(token.balanceOf(alice), ALICE_AMOUNT);
        assertTrue(airdrop.claimed(alice));
    }

    function test_RevertDoubleClaim() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT);
        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        bytes32[] memory proof = new bytes32[](0);

        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, proof);

        vm.prank(alice);
        vm.expectRevert("MerkleAirdrop: ALREADY_CLAIMED");
        airdrop.claim(ALICE_AMOUNT, proof);
    }

    function test_RevertInvalidProof() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT);
        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _leaf(bob, BOB_AMOUNT);

        vm.prank(alice);
        vm.expectRevert("MerkleAirdrop: INVALID_PROOF");
        airdrop.claim(ALICE_AMOUNT, proof);
    }

    function test_RevertAfterDeadline() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT);
        airdrop.setMerkleRoot(root, block.timestamp + 1 days);
        airdrop.fund(ALICE_AMOUNT);

        vm.warp(block.timestamp + 2 days);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        vm.expectRevert("MerkleAirdrop: EXPIRED");
        airdrop.claim(ALICE_AMOUNT, proof);
    }

    function test_RevertEmptyRoot() public {
        vm.expectRevert("MerkleAirdrop: EMPTY_ROOT");
        airdrop.setMerkleRoot(bytes32(0), block.timestamp + 1 days);
    }

    function test_RevertPastDeadlineOnSet() public {
        vm.expectRevert("MerkleAirdrop: INVALID_DEADLINE");
        airdrop.setMerkleRoot(bytes32(uint256(1)), block.timestamp - 1);
    }

    function test_RecoverUnclaimedAfterDeadline() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT);
        airdrop.setMerkleRoot(root, block.timestamp + 1 days);
        airdrop.fund(ALICE_AMOUNT + 1000e6);

        vm.warp(block.timestamp + 2 days);

        address treasury = makeAddr("treasury");
        airdrop.recoverUnclaimed(treasury);
        assertEq(token.balanceOf(treasury), ALICE_AMOUNT + 1000e6);
    }

    function test_RevertRecoverBeforeDeadline() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT);
        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        vm.expectRevert("MerkleAirdrop: NOT_EXPIRED");
        airdrop.recoverUnclaimed(makeAddr("treasury"));
    }

    function test_NewRootAllowsClaimAfterPreviousRoot() public {
        bytes32 root1 = _leaf(alice, ALICE_AMOUNT);
        airdrop.setMerkleRoot(root1, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, proof);
        assertTrue(airdrop.claimed(alice));

        bytes32 root2 = _leaf(alice, BOB_AMOUNT);
        airdrop.setMerkleRoot(root2, block.timestamp + 7 days);
        airdrop.fund(BOB_AMOUNT);

        vm.prank(alice);
        airdrop.claim(BOB_AMOUNT, proof);
        assertEq(token.balanceOf(alice), ALICE_AMOUNT + BOB_AMOUNT);
    }
}
