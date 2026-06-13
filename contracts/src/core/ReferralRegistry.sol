// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReferralRegistry — dual-reward referral (15% referrer / 10% referee boost)
contract ReferralRegistry is Ownable {
    uint256 public constant REFERRER_BONUS_BPS = 1500; // 15%
    uint256 public constant REFEREE_BOOST_BPS = 1000; // 10%

    mapping(bytes32 => address) public codeToReferrer;
    mapping(address => bytes32) public referrerCode;
    mapping(address => address) public refereeToReferrer;
    mapping(address => uint256) public referralCount;

    event CodeRegistered(address indexed referrer, bytes32 code);
    event RefereeBound(address indexed referee, address indexed referrer, bytes32 code);

    constructor() Ownable(msg.sender) {}

    function registerCode(bytes32 code) external {
        require(code != bytes32(0), "ReferralRegistry: EMPTY_CODE");
        require(codeToReferrer[code] == address(0), "ReferralRegistry: CODE_TAKEN");
        require(referrerCode[msg.sender] == bytes32(0), "ReferralRegistry: ALREADY_REGISTERED");
        codeToReferrer[code] = msg.sender;
        referrerCode[msg.sender] = code;
        emit CodeRegistered(msg.sender, code);
    }

    function enterInvitationCode(bytes32 code) external {
        require(code != bytes32(0), "ReferralRegistry: EMPTY_CODE");
        address referrer = codeToReferrer[code];
        require(referrer != address(0), "ReferralRegistry: INVALID_CODE");
        require(referrer != msg.sender, "ReferralRegistry: SELF_REFERRAL");
        require(refereeToReferrer[msg.sender] == address(0), "ReferralRegistry: ALREADY_BOUND");
        require(refereeToReferrer[referrer] != msg.sender, "ReferralRegistry: MUTUAL_REFERRAL");
        refereeToReferrer[msg.sender] = referrer;
        referralCount[referrer]++;
        emit RefereeBound(msg.sender, referrer, code);
    }

    function getReferrer(address user) external view returns (address) {
        return refereeToReferrer[user];
    }

    function applyRefereeBoost(address user, uint256 basePoints) external view returns (uint256) {
        if (refereeToReferrer[user] == address(0)) return basePoints;
        return basePoints + (basePoints * REFEREE_BOOST_BPS) / 10_000;
    }
}
