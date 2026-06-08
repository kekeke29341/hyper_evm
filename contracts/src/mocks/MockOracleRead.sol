// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracleRead} from "../interfaces/IOracleRead.sol";

contract MockOracleRead is IOracleRead {
    mapping(uint32 => uint256) public prices;

    function setPrice(uint32 assetId, uint256 price) external {
        prices[assetId] = price;
    }

    function oraclePx(uint32 assetId) external view returns (uint256) {
        return prices[assetId];
    }
}
