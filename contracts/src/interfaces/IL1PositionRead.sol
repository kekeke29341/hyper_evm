// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Position} from "../libraries/L1Read.sol";

/// @notice Position read precompile at 0x800
interface IL1PositionRead {
    function position(address user, uint16 perp) external view returns (Position memory);
}
