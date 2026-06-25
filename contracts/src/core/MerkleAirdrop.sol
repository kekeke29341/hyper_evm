// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MerkleAirdrop — Cashdrop claim via merkle proofs
/// @dev When vaultShareToken is set, leaves include snapshot minShares for proof integrity.
///      Claims do not require current share balance, so earned rewards remain claimable after withdraw.
///      rewardToken MUST be a non-callback ERC20 (e.g. USDC); callback tokens (ERC-777) are unsupported.
contract MerkleAirdrop is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public rewardToken;
    IERC20 public vaultShareToken;
    bytes32 public merkleRoot;
    uint256 public claimDeadline;

    mapping(bytes32 => mapping(address => bool)) public claimedByRoot;
    mapping(bytes32 => bool) public distributionExecuted;

    event Claimed(address indexed account, uint256 amount);
    event Distributed(bytes32 indexed distributionId, address indexed account, uint256 amount);
    event MerkleRootUpdated(bytes32 root, uint256 deadline);
    event VaultShareTokenUpdated(address indexed vaultShareToken);
    event ForeignTokenRecovered(address indexed token, address indexed to, uint256 amount);

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

    function claim(uint256 amount, uint256 minShares, bytes32[] calldata proof) external whenNotPaused nonReentrant {
        require(merkleRoot != bytes32(0), "MerkleAirdrop: NOT_CONFIGURED");
        require(block.timestamp <= claimDeadline, "MerkleAirdrop: EXPIRED");
        require(!claimedByRoot[merkleRoot][msg.sender], "MerkleAirdrop: ALREADY_CLAIMED");
        require(amount > 0, "MerkleAirdrop: ZERO_AMOUNT");

        bytes32 leaf = _leaf(msg.sender, amount, minShares);
        require(MerkleProof.verify(proof, merkleRoot, leaf), "MerkleAirdrop: INVALID_PROOF");

        if (address(vaultShareToken) != address(0)) {
            require(minShares > 0, "MerkleAirdrop: MIN_SHARES");
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

    /// @notice Operator-run daily payout. Reverts on duplicate distributionId to prevent double sends.
    /// @dev Shares the same pooled balance and the same per-account `claimedByRoot[merkleRoot]` ledger as
    ///      `claim`. Accounts that already claimed the active root via `claim` are skipped here, and accounts
    ///      paid here are marked claimed for the active root, so an account can never be paid by both paths
    ///      for the same root.
    function distributeRewards(
        bytes32 distributionId,
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external onlyOwner whenNotPaused nonReentrant {
        require(distributionId != bytes32(0), "MerkleAirdrop: EMPTY_DISTRIBUTION");
        require(!distributionExecuted[distributionId], "MerkleAirdrop: DISTRIBUTED");
        require(accounts.length == amounts.length, "MerkleAirdrop: LENGTH");
        require(accounts.length > 0, "MerkleAirdrop: EMPTY");

        bytes32 root = merkleRoot;
        distributionExecuted[distributionId] = true;
        for (uint256 i = 0; i < accounts.length; i++) {
            require(accounts[i] != address(0), "MerkleAirdrop: ZERO_ADDRESS");
            require(amounts[i] > 0, "MerkleAirdrop: ZERO_AMOUNT");
            // Skip anyone who already pulled the active root via claim(); avoids double payment.
            if (root != bytes32(0) && claimedByRoot[root][accounts[i]]) continue;
            if (root != bytes32(0)) claimedByRoot[root][accounts[i]] = true;
            rewardToken.safeTransfer(accounts[i], amounts[i]);
            emit Distributed(distributionId, accounts[i], amounts[i]);
        }
    }

    /// @notice Cashdrop USDC is never swept by the owner; unclaimed rewards are carried into future roots.
    function recoverUnclaimed(address) external pure {
        revert("MerkleAirdrop: CARRY_FORWARD_ONLY");
    }

    /// @notice Recover non-reward tokens accidentally sent to this contract.
    function recoverForeignToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(address(token) != address(rewardToken), "MerkleAirdrop: REWARD_TOKEN");
        require(to != address(0), "MerkleAirdrop: ZERO_ADDRESS");
        require(amount > 0, "MerkleAirdrop: ZERO_AMOUNT");
        token.safeTransfer(to, amount);
        emit ForeignTokenRecovered(address(token), to, amount);
    }
}
