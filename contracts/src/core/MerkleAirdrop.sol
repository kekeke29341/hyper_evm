// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MerkleAirdrop — Cashdrop claim via merkle proofs
/// @dev When vaultShareToken is set, leaves include minShares and claim requires balance >= minShares
contract MerkleAirdrop is Ownable, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public rewardToken;
    IERC20 public vaultShareToken;
    bytes32 public merkleRoot;
    uint256 public claimDeadline;

    mapping(bytes32 => mapping(address => bool)) public claimedByRoot;

    event Claimed(address indexed account, uint256 amount);
    event MerkleRootUpdated(bytes32 root, uint256 deadline);
    event VaultShareTokenUpdated(address indexed vaultShareToken);

    constructor(address _rewardToken) Ownable(msg.sender) {
        rewardToken = IERC20(_rewardToken);
    }

    function setVaultShareToken(address _vaultShareToken) external onlyOwner {
        vaultShareToken = IERC20(_vaultShareToken);
        emit VaultShareTokenUpdated(_vaultShareToken);
    }

    function setMerkleRoot(bytes32 root, uint256 deadline) external onlyOwner {
        require(root != bytes32(0), "MerkleAirdrop: EMPTY_ROOT");
        require(deadline > block.timestamp, "MerkleAirdrop: INVALID_DEADLINE");
        merkleRoot = root;
        claimDeadline = deadline;
        emit MerkleRootUpdated(root, deadline);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function claim(uint256 amount, uint256 minShares, bytes32[] calldata proof) external whenNotPaused {
        require(merkleRoot != bytes32(0), "MerkleAirdrop: NOT_CONFIGURED");
        require(block.timestamp <= claimDeadline, "MerkleAirdrop: EXPIRED");
        require(!claimedByRoot[merkleRoot][msg.sender], "MerkleAirdrop: ALREADY_CLAIMED");
        require(amount > 0, "MerkleAirdrop: ZERO_AMOUNT");

        bytes32 leaf = _leaf(msg.sender, amount, minShares);
        require(MerkleProof.verify(proof, merkleRoot, leaf), "MerkleAirdrop: INVALID_PROOF");

        if (address(vaultShareToken) != address(0)) {
            require(minShares > 0, "MerkleAirdrop: MIN_SHARES");
            require(vaultShareToken.balanceOf(msg.sender) >= minShares, "MerkleAirdrop: INSUFFICIENT_SHARES");
        } else {
            require(minShares == 0, "MerkleAirdrop: MIN_SHARES");
        }

        require(rewardToken.balanceOf(address(this)) >= amount, "MerkleAirdrop: INSUFFICIENT_BALANCE");
        claimedByRoot[merkleRoot][msg.sender] = true;
        rewardToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function _leaf(address account, uint256 amount, uint256 minShares) internal view returns (bytes32) {
        if (address(vaultShareToken) != address(0)) {
            return keccak256(bytes.concat(keccak256(abi.encode(account, amount, minShares))));
        }
        require(minShares == 0, "MerkleAirdrop: MIN_SHARES");
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    /// @notice Whether the current merkle root has been claimed by account
    function claimed(address account) external view returns (bool) {
        return claimedByRoot[merkleRoot][account];
    }

    function fund(uint256 amount) external onlyOwner {
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function recoverUnclaimed(address to) external onlyOwner {
        require(block.timestamp > claimDeadline, "MerkleAirdrop: NOT_EXPIRED");
        require(to != address(0), "MerkleAirdrop: ZERO_ADDRESS");
        rewardToken.safeTransfer(to, rewardToken.balanceOf(address(this)));
    }
}
