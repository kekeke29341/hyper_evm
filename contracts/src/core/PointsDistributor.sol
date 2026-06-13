// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReferralRegistry} from "./ReferralRegistry.sol";

/// @title PointsDistributor — fee-generation-based points (not capital size)
/// @dev userPoints is an off-chain-readable ledger; no on-chain claim — points are not burned by mistake.
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

    mapping(address => bool) public authorizedPools;

    event PointsRecorded(address indexed user, address indexed pool, uint256 feeAmount, uint256 pointsAdded);
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

    function recordFeeContribution(address pool, address user, uint256 feeAmount) external onlyPool {
        require(pool == msg.sender, "PointsDistributor: POOL_MISMATCH");
        _maybeAdvanceEpoch();

        uint256 epoch = currentEpoch;
        uint256 oldContrib = epochFeeContribution[epoch][user];
        uint256 newContrib = oldContrib + feeAmount;
        uint256 oldTotal = epochTotalFees[epoch];
        uint256 newTotal = oldTotal + feeAmount;

        epochFeeContribution[epoch][user] = newContrib;
        epochTotalFees[epoch] = newTotal;

        uint256 oldPoints = oldTotal > 0 ? (oldContrib * DAILY_POOL) / oldTotal : 0;
        uint256 newPoints = newTotal > 0 ? (newContrib * DAILY_POOL) / newTotal : 0;
        uint256 basePoints = newPoints - oldPoints;

        uint256 boosted = referralRegistry.applyRefereeBoost(user, basePoints);
        userPoints[user] += boosted;
        totalPointsDistributed += boosted;

        address referrer = referralRegistry.getReferrer(user);
        if (referrer != address(0)) {
            uint256 referralBonus = (boosted * 1500) / 10_000; // 15% of generated points
            userPoints[referrer] += referralBonus;
            totalPointsDistributed += referralBonus;
        }

        emit PointsRecorded(user, pool, feeAmount, boosted);
    }

    function getUserPoints(address user) external view returns (uint256) {
        return userPoints[user];
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
}
