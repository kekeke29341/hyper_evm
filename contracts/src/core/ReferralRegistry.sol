// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReferralRegistry — wallet-address referral (15% referrer / 5% referee boost on USDC Cashdrop)
/// @dev Referees bind to a registered referrer address. Daily payouts calculate boosts off-chain.
contract ReferralRegistry is Ownable {
    uint256 public constant REFERRER_BONUS_BPS = 1500; // 15%
    uint256 public constant REFEREE_BOOST_BPS = 500; // 5%

    mapping(address => bool) public isRegisteredReferrer;
    mapping(address => address) public refereeToReferrer;
    mapping(address => uint256) public referralCount;

    event ReferrerRegistered(address indexed referrer);
    event RefereeBound(address indexed referee, address indexed referrer);

    constructor() Ownable(msg.sender) {}

    function registerReferrer() external {
        require(!isRegisteredReferrer[msg.sender], "ReferralRegistry: ALREADY_REGISTERED");
        isRegisteredReferrer[msg.sender] = true;
        emit ReferrerRegistered(msg.sender);
    }

    function bindReferrer(address referrer) external {
        require(referrer != address(0), "ReferralRegistry: ZERO_REFERRER");
        require(isRegisteredReferrer[referrer], "ReferralRegistry: INVALID_REFERRER");
        require(referrer != msg.sender, "ReferralRegistry: SELF_REFERRAL");
        require(refereeToReferrer[msg.sender] == address(0), "ReferralRegistry: ALREADY_BOUND");
        require(refereeToReferrer[referrer] != msg.sender, "ReferralRegistry: MUTUAL_REFERRAL");
        refereeToReferrer[msg.sender] = referrer;
        referralCount[referrer]++;
        emit RefereeBound(msg.sender, referrer);
    }

    function getReferrer(address user) external view returns (address) {
        return refereeToReferrer[user];
    }

    /// @notice Future: boost a user's USDC reward base before referral commission split.
    function applyRefereeBoost(address user, uint256 baseRewardUsdc) external view returns (uint256) {
        if (refereeToReferrer[user] == address(0)) return baseRewardUsdc;
        return baseRewardUsdc + (baseRewardUsdc * REFEREE_BOOST_BPS) / 10_000;
    }
}
