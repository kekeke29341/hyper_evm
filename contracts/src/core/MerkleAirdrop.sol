// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MerkleAirdrop — Cashdrop claim via merkle proofs
contract MerkleAirdrop is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public rewardToken;
    bytes32 public merkleRoot;
    uint256 public claimDeadline;

    mapping(address => bool) public claimed;

    event Claimed(address indexed account, uint256 amount);
    event MerkleRootUpdated(bytes32 root, uint256 deadline);

    constructor(address _rewardToken) Ownable(msg.sender) {
        rewardToken = IERC20(_rewardToken);
    }

    function setMerkleRoot(bytes32 root, uint256 deadline) external onlyOwner {
        require(root != bytes32(0), "MerkleAirdrop: EMPTY_ROOT");
        require(deadline > block.timestamp, "MerkleAirdrop: INVALID_DEADLINE");
        merkleRoot = root;
        claimDeadline = deadline;
        emit MerkleRootUpdated(root, deadline);
    }

    function claim(uint256 amount, bytes32[] calldata proof) external {
        require(merkleRoot != bytes32(0), "MerkleAirdrop: NOT_CONFIGURED");
        require(block.timestamp <= claimDeadline, "MerkleAirdrop: EXPIRED");
        require(!claimed[msg.sender], "MerkleAirdrop: ALREADY_CLAIMED");
        require(amount > 0, "MerkleAirdrop: ZERO_AMOUNT");
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "MerkleAirdrop: INVALID_PROOF");
        require(rewardToken.balanceOf(address(this)) >= amount, "MerkleAirdrop: INSUFFICIENT_BALANCE");
        claimed[msg.sender] = true;
        rewardToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function fund(uint256 amount) external onlyOwner {
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
    }
}
