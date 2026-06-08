// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FeeCollector — receives protocol share (14%) of swap fees
contract FeeCollector is Ownable {
    using SafeERC20 for IERC20;

    event FeesReceived(address indexed token, uint256 amount);

    constructor() Ownable(msg.sender) {}

    receive() external payable {}

    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "FeeCollector: ZERO_RECIPIENT");
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "FeeCollector: ETH_TRANSFER_FAILED");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
