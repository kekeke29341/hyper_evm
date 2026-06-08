// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice CoreWriter system contract at 0x3333...3333
interface ICoreWriter {
    event RawAction(address indexed user, bytes data);

    function sendRawAction(bytes calldata data) external;
}
