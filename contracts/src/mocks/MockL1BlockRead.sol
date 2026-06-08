// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Mock injected at 0x809 via vm.etch for local Anvil tests.
contract MockL1BlockRead {
    uint64 public mockBlockNumber = 1_000_000;

    function setBlockNumber(uint64 n) external {
        mockBlockNumber = n;
    }

    function l1BlockNumber() external view returns (uint64) {
        return mockBlockNumber;
    }
}
