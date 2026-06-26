// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IProjectXSwapRouter} from "../interfaces/IProjectXSwapRouter.sol";

/// @title MockSwapRouter — fixed-price WHYPE→USDC for local/test harvest
contract MockSwapRouter is IProjectXSwapRouter {
    using SafeERC20 for IERC20;

    /// @dev USDC (6 dec) per 1 HYPE (1e18 wei), default 42 USDC
    uint256 public priceUsdc6PerHype18;

    constructor(uint256 _priceUsdc6PerHype18) {
        priceUsdc6PerHype18 = _priceUsdc6PerHype18 == 0 ? 42e6 * 1e12 : _priceUsdc6PerHype18;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        require(params.amountIn > 0, "MockSwapRouter: ZERO_IN");
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        uint8 inDecimals = IERC20Metadata(params.tokenIn).decimals();
        uint8 outDecimals = IERC20Metadata(params.tokenOut).decimals();
        if (inDecimals == 18 && outDecimals == 6) {
            amountOut = (params.amountIn * priceUsdc6PerHype18) / 1e30;
        } else if (inDecimals == 6 && outDecimals == 18) {
            amountOut = (params.amountIn * 1e30) / priceUsdc6PerHype18;
        } else {
            revert("MockSwapRouter: PAIR");
        }
        require(amountOut >= params.amountOutMinimum, "MockSwapRouter: SLIPPAGE");

        IERC20 out = IERC20(params.tokenOut);
        require(out.balanceOf(address(this)) >= amountOut, "MockSwapRouter: INSUFFICIENT_LIQ");
        out.safeTransfer(params.recipient, amountOut);
    }

    /// @dev Testnet helper — seed router with USDC for HYPE fee swaps
    function fund(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }
}
