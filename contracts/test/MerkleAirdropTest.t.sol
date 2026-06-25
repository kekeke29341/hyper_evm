// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract MerkleAirdropTest is Test {
    MockERC20 token;
    MockERC20 vaultShares;
    MerkleAirdrop airdrop;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address owner = address(this);

    uint256 constant ALICE_AMOUNT = 1000e6;
    uint256 constant BOB_AMOUNT = 500e6;
    uint256 constant ALICE_MIN_SHARES = 100e6;

    function setUp() public {
        token = new MockERC20("USDC", "USDC", 6);
        vaultShares = new MockERC20("VAULT", "VAULT", 6);
        airdrop = new MerkleAirdrop(address(token));
        token.mint(owner, 10_000e6);
        token.approve(address(airdrop), type(uint256).max);
    }

    function _leaf(address account, uint256 amount, uint256 minShares, bool gated) internal pure returns (bytes32) {
        if (gated) {
            return keccak256(bytes.concat(keccak256(abi.encode(account, amount, minShares))));
        }
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    function _root(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function test_ClaimWithValidProof() public {
        bytes32 leafAlice = _leaf(alice, ALICE_AMOUNT, 0, false);
        bytes32 leafBob = _leaf(bob, BOB_AMOUNT, 0, false);
        bytes32 root = _root(leafAlice, leafBob);

        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT + BOB_AMOUNT);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leafBob;

        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, 0, proof);

        assertEq(token.balanceOf(alice), ALICE_AMOUNT);
        assertTrue(airdrop.claimed(alice));
    }

    function test_ClaimWithVaultShareGate() public {
        airdrop.setVaultShareToken(address(vaultShares));

        bytes32 leaf = _leaf(alice, ALICE_AMOUNT, ALICE_MIN_SHARES, true);
        airdrop.setMerkleRoot(leaf, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        vaultShares.mint(alice, ALICE_MIN_SHARES);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, ALICE_MIN_SHARES, proof);
        assertEq(token.balanceOf(alice), ALICE_AMOUNT);
    }

    function test_ClaimWithSnapshotSharesAfterWithdraw() public {
        airdrop.setVaultShareToken(address(vaultShares));

        bytes32 leaf = _leaf(alice, ALICE_AMOUNT, ALICE_MIN_SHARES, true);
        airdrop.setMerkleRoot(leaf, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, ALICE_MIN_SHARES, proof);

        assertEq(token.balanceOf(alice), ALICE_AMOUNT);
    }

    function test_RevertDoubleClaim() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT, 0, false);
        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        bytes32[] memory proof = new bytes32[](0);

        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, 0, proof);

        vm.prank(alice);
        vm.expectRevert("MerkleAirdrop: ALREADY_CLAIMED");
        airdrop.claim(ALICE_AMOUNT, 0, proof);
    }

    function test_RevertInvalidProof() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT, 0, false);
        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _leaf(bob, BOB_AMOUNT, 0, false);

        vm.prank(alice);
        vm.expectRevert("MerkleAirdrop: INVALID_PROOF");
        airdrop.claim(ALICE_AMOUNT, 0, proof);
    }

    function test_RevertAfterDeadline() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT, 0, false);
        airdrop.setMerkleRoot(root, block.timestamp + 1 days);
        airdrop.fund(ALICE_AMOUNT);

        vm.warp(block.timestamp + 2 days);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        vm.expectRevert("MerkleAirdrop: EXPIRED");
        airdrop.claim(ALICE_AMOUNT, 0, proof);
    }

    function test_RevertEmptyRoot() public {
        vm.expectRevert("MerkleAirdrop: EMPTY_ROOT");
        airdrop.setMerkleRoot(bytes32(0), block.timestamp + 1 days);
    }

    function test_RevertPastDeadlineOnSet() public {
        vm.expectRevert("MerkleAirdrop: INVALID_DEADLINE");
        airdrop.setMerkleRoot(bytes32(uint256(1)), block.timestamp - 1);
    }

    function test_RecoverUnclaimedRewardTokenDisabled() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT, 0, false);
        airdrop.setMerkleRoot(root, block.timestamp + 1 days);
        airdrop.fund(ALICE_AMOUNT + 1000e6);

        vm.warp(block.timestamp + 2 days);

        address treasury = makeAddr("treasury");
        vm.expectRevert("MerkleAirdrop: CARRY_FORWARD_ONLY");
        airdrop.recoverUnclaimed(treasury);
        assertEq(token.balanceOf(treasury), 0);
        assertEq(token.balanceOf(address(airdrop)), ALICE_AMOUNT + 1000e6);
    }

    function test_DistributeRewardsByOwner() public {
        airdrop.fund(ALICE_AMOUNT + BOB_AMOUNT);

        address[] memory accounts = new address[](2);
        accounts[0] = alice;
        accounts[1] = bob;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ALICE_AMOUNT;
        amounts[1] = BOB_AMOUNT;

        bytes32 distributionId = keccak256("daily-1");
        airdrop.distributeRewards(distributionId, accounts, amounts);

        assertEq(token.balanceOf(alice), ALICE_AMOUNT);
        assertEq(token.balanceOf(bob), BOB_AMOUNT);
        assertTrue(airdrop.distributionExecuted(distributionId));
    }

    function test_RevertDuplicateDistribution() public {
        airdrop.fund(ALICE_AMOUNT * 2);

        address[] memory accounts = new address[](1);
        accounts[0] = alice;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ALICE_AMOUNT;

        bytes32 distributionId = keccak256("daily-1");
        airdrop.distributeRewards(distributionId, accounts, amounts);

        vm.expectRevert("MerkleAirdrop: DISTRIBUTED");
        airdrop.distributeRewards(distributionId, accounts, amounts);
    }

    function test_RevertNonOwnerDistribution() public {
        address[] memory accounts = new address[](1);
        accounts[0] = alice;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ALICE_AMOUNT;

        vm.prank(alice);
        vm.expectRevert();
        airdrop.distributeRewards(keccak256("daily-1"), accounts, amounts);
    }

    function test_RecoverForeignToken() public {
        MockERC20 other = new MockERC20("OTHER", "OTHER", 18);
        other.mint(address(airdrop), 1 ether);

        address treasury = makeAddr("treasury");
        airdrop.recoverForeignToken(other, treasury, 1 ether);
        assertEq(other.balanceOf(treasury), 1 ether);
    }

    function test_RevertRecoverRewardTokenAsForeignToken() public {
        vm.expectRevert("MerkleAirdrop: REWARD_TOKEN");
        airdrop.recoverForeignToken(token, makeAddr("treasury"), 1);
    }

    function test_NewRootAllowsClaimAfterPreviousRoot() public {
        bytes32 root1 = _leaf(alice, ALICE_AMOUNT, 0, false);
        airdrop.setMerkleRoot(root1, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, 0, proof);
        assertTrue(airdrop.claimed(alice));

        bytes32 root2 = _leaf(alice, BOB_AMOUNT, 0, false);
        airdrop.setMerkleRoot(root2, block.timestamp + 7 days);
        airdrop.fund(BOB_AMOUNT);

        vm.prank(alice);
        airdrop.claim(BOB_AMOUNT, 0, proof);
        assertEq(token.balanceOf(alice), ALICE_AMOUNT + BOB_AMOUNT);
    }

    /// @notice An account paid via distributeRewards cannot also claim the active root.
    function test_ClaimBlockedAfterDistributeForSameRoot() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT, 0, false);
        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT * 2);

        address[] memory accounts = new address[](1);
        accounts[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ALICE_AMOUNT;
        airdrop.distributeRewards(keccak256("daily-1"), accounts, amounts);

        assertEq(token.balanceOf(alice), ALICE_AMOUNT);
        assertTrue(airdrop.claimed(alice));

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        vm.expectRevert("MerkleAirdrop: ALREADY_CLAIMED");
        airdrop.claim(ALICE_AMOUNT, 0, proof);
    }

    /// @notice distributeRewards skips an account that already pulled the active root via claim.
    function test_DistributeSkipsAlreadyClaimedAccount() public {
        bytes32 root = _leaf(alice, ALICE_AMOUNT, 0, false);
        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        airdrop.fund(ALICE_AMOUNT + BOB_AMOUNT);

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        airdrop.claim(ALICE_AMOUNT, 0, proof);
        assertEq(token.balanceOf(alice), ALICE_AMOUNT);

        // Operator batch re-includes alice (already claimed) plus bob; alice must be skipped.
        address[] memory accounts = new address[](2);
        accounts[0] = alice;
        accounts[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = ALICE_AMOUNT;
        amounts[1] = BOB_AMOUNT;
        airdrop.distributeRewards(keccak256("daily-1"), accounts, amounts);

        assertEq(token.balanceOf(alice), ALICE_AMOUNT, "alice not double-paid");
        assertEq(token.balanceOf(bob), BOB_AMOUNT, "bob paid once");
    }
}
