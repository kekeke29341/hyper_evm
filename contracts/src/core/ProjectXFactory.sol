// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProjectXPair} from "./ProjectXPair.sol";

/// @title ProjectXFactory — deploys ProjectXPair instances
contract ProjectXFactory {
    address public feeCollector;
    address public pointsDistributor;
    address public feeToSetter;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256);

    constructor(address _feeCollector, address _pointsDistributor, address _feeToSetter) {
        feeCollector = _feeCollector;
        pointsDistributor = _pointsDistributor;
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(msg.sender == feeToSetter, "ProjectXFactory: FORBIDDEN");
        require(tokenA != tokenB, "ProjectXFactory: IDENTICAL");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "ProjectXFactory: ZERO_ADDRESS");
        require(token0.code.length > 0 && token1.code.length > 0, "ProjectXFactory: NOT_CONTRACT");
        require(getPair[token0][token1] == address(0), "ProjectXFactory: PAIR_EXISTS");

        pair = address(new ProjectXPair());
        ProjectXPair(pair).initialize(token0, token1, feeCollector, pointsDistributor);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeCollector(address _feeCollector) external {
        require(msg.sender == feeToSetter, "ProjectXFactory: FORBIDDEN");
        require(_feeCollector != address(0), "ProjectXFactory: ZERO_ADDRESS");
        feeCollector = _feeCollector;
    }

    function setPointsDistributor(address _pointsDistributor) external {
        require(msg.sender == feeToSetter, "ProjectXFactory: FORBIDDEN");
        require(_pointsDistributor != address(0), "ProjectXFactory: ZERO_ADDRESS");
        pointsDistributor = _pointsDistributor;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "ProjectXFactory: FORBIDDEN");
        require(_feeToSetter != address(0), "ProjectXFactory: ZERO_ADDRESS");
        feeToSetter = _feeToSetter;
    }

    /// @notice Batch-sync fee collector / points distributor to existing pairs (2M gas safe)
    function syncPairs(uint256 start, uint256 end) external {
        require(msg.sender == feeToSetter, "ProjectXFactory: FORBIDDEN");
        require(end <= allPairs.length, "ProjectXFactory: END_OOB");
        require(start <= end, "ProjectXFactory: INVALID_RANGE");
        for (uint256 i = start; i < end; i++) {
            ProjectXPair(allPairs[i]).setConfig(feeCollector, pointsDistributor);
        }
    }
}
