// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReferralRegistry} from "./ReferralRegistry.sol";

/// @title PointsDistributor — fee-generation-based points (not capital size)
/// @dev userPoints is an off-chain-readable ledger; points for a closed epoch are claimed via claimEpochPoints.
contract PointsDistributor is Ownable {
    uint256 public constant DAILY_POOL = 1_000_000 ether; // 1M PTS (18 dec display)
    uint256 public constant EPOCH_DURATION = 1 days;

    ReferralRegistry public referralRegistry;

    uint256 public currentEpoch;
    uint256 public epochStart;
    uint256 public totalPointsDistributed;

    mapping(address => uint256) public userPoints;
    mapping(uint256 => mapping(address => uint256)) public epochFeeContribution;
    mapping(uint256 => uint256) public epochTotalFees;
    mapping(uint256 => mapping(address => bool)) public epochPointsClaimed;
    mapping(uint256 => uint256) public epochBasePointsDistributed;

    mapping(address => bool) public authorizedPools;

    event PointsRecorded(address indexed user, address indexed pool, uint256 feeAmount);
    event PointsClaimed(address indexed user, uint256 indexed epoch, uint256 basePoints, uint256 boostedPoints);
    event EpochAdvanced(uint256 indexed epoch, uint256 totalFees);

    constructor(address _referralRegistry) Ownable(msg.sender) {
        referralRegistry = ReferralRegistry(_referralRegistry);
        epochStart = block.timestamp;
    }

    modifier onlyPool() {
        require(authorizedPools[msg.sender], "PointsDistributor: UNAUTHORIZED");
        _;
    }

    function authorizePool(address pool) external onlyOwner {
        require(pool != address(0), "PointsDistributor: ZERO_ADDRESS");
        require(pool.code.length > 0, "PointsDistributor: NOT_CONTRACT");
        authorizedPools[pool] = true;
    }

    function deauthorizePool(address pool) external onlyOwner {
        authorizedPools[pool] = false;
    }

    /// @notice Record fee contribution for the active epoch. Points are allocated when the epoch closes (claim).
    function recordFeeContribution(address pool, address user, uint256 feeAmount) external onlyPool {
        require(pool == msg.sender, "PointsDistributor: POOL_MISMATCH");
        _maybeAdvanceEpoch();
        _claimPendingEpochs(user);

        uint256 epoch = currentEpoch;
        epochFeeContribution[epoch][user] += feeAmount;
        epochTotalFees[epoch] += feeAmount;

        emit PointsRecorded(user, pool, feeAmount);
    }

    /// @notice Claim proportional points for a closed epoch.
    function claimEpochPoints(uint256 epoch) external {
        _claimEpochPoints(msg.sender, epoch);
    }

    /// @notice Claim all closed epochs with recorded contributions.
    function claimAllPendingEpochs() external {
        for (uint256 e = 0; e < currentEpoch; e++) {
            _claimEpochPoints(msg.sender, e);
        }
    }

    function getUserPoints(address user) external view returns (uint256) {
        return userPoints[user];
    }

    /// @notice Preview base points for an epoch (before referral boost), including unclaimed closed epochs.
    function previewEpochPoints(uint256 epoch, address user) external view returns (uint256) {
        uint256 total = epochTotalFees[epoch];
        if (total == 0) return 0;
        uint256 contrib = epochFeeContribution[epoch][user];
        if (contrib == 0) return 0;
        return (contrib * DAILY_POOL) / total;
    }

    function timeUntilNextEpoch() external view returns (uint256) {
        if (block.timestamp >= epochStart + EPOCH_DURATION) return 0;
        return epochStart + EPOCH_DURATION - block.timestamp;
    }

    function _maybeAdvanceEpoch() internal {
        while (block.timestamp >= epochStart + EPOCH_DURATION) {
            emit EpochAdvanced(currentEpoch, epochTotalFees[currentEpoch]);
            currentEpoch++;
            epochStart += EPOCH_DURATION;
        }
    }

    function _isEpochClosed(uint256 epoch) internal view returns (bool) {
        if (epoch < currentEpoch) return true;
        if (epoch > currentEpoch) return false;
        return block.timestamp >= epochStart + EPOCH_DURATION;
    }

    function _claimPendingEpochs(address user) internal {
        for (uint256 e = 0; e < currentEpoch; e++) {
            _claimEpochPoints(user, e);
        }
        if (_isEpochClosed(currentEpoch)) {
            _claimEpochPoints(user, currentEpoch);
        }
    }

    function _claimEpochPoints(address user, uint256 epoch) internal {
        if (!_isEpochClosed(epoch)) return;
        if (epochPointsClaimed[epoch][user]) return;

        uint256 contrib = epochFeeContribution[epoch][user];
        if (contrib == 0) return;

        uint256 total = epochTotalFees[epoch];
        if (total == 0) return;

        epochPointsClaimed[epoch][user] = true;

        uint256 remaining = DAILY_POOL - epochBasePointsDistributed[epoch];
        uint256 basePoints = (contrib * DAILY_POOL) / total;
        if (basePoints > remaining) basePoints = remaining;
        epochBasePointsDistributed[epoch] += basePoints;

        uint256 boosted = referralRegistry.applyRefereeBoost(user, basePoints);
        userPoints[user] += boosted;
        totalPointsDistributed += boosted;

        address referrer = referralRegistry.getReferrer(user);
        if (referrer != address(0)) {
            uint256 referralBonus = (boosted * 1500) / 10_000; // 15% of generated points
            userPoints[referrer] += referralBonus;
            totalPointsDistributed += referralBonus;
        }

        emit PointsClaimed(user, epoch, basePoints, boosted);
    }
}
