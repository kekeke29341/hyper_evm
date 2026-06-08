// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Position} from "../libraries/L1Read.sol";
import {IL1PositionRead} from "../interfaces/IL1PositionRead.sol";

/// @dev Mock injected at 0x800 via vm.etch for local Anvil tests.
contract MockL1PositionRead is IL1PositionRead {
    mapping(address => mapping(uint16 => Position)) public positions;

    function setPosition(address user, uint16 perp, Position calldata pos) external {
        positions[user][perp] = pos;
    }

    function position(address user, uint16 perp) external view returns (Position memory) {
        return positions[user][perp];
    }
}
