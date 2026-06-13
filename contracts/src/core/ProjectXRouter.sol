// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ProjectXFactory} from "./ProjectXFactory.sol";
import {ProjectXPair} from "./ProjectXPair.sol";
import {PoolMath} from "../libraries/PoolMath.sol";

/// @title ProjectXRouter — swap and liquidity entrypoint with slippage protection
contract ProjectXRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable factory;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "ProjectXRouter: EXPIRED");
        _;
    }

    constructor(address _factory) {
        factory = _factory;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _quoteLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = ProjectXFactory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "ProjectXRouter: PAIR_NOT_EXISTS");
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = ProjectXPair(pair).mint(to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = ProjectXFactory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "ProjectXRouter: PAIR_NOT_EXISTS");
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        (amountA, amountB) = ProjectXPair(pair).burn(to);
        require(amountA >= amountAMin && amountB >= amountBMin, "ProjectXRouter: INSUFFICIENT_AMOUNTS");
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "ProjectXRouter: INSUFFICIENT_OUTPUT");
        IERC20(path[0]).safeTransferFrom(msg.sender, _pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to, msg.sender);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts) {
        require(path.length >= 2, "ProjectXRouter: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i], path[i + 1]);
            amounts[i + 1] = PoolMath.getAmountOut(amounts[i], reserveIn, reserveOut, PoolMath.SWAP_FEE_BPS);
        }
    }

    function _swap(uint256[] memory amounts, address[] memory path, address _to, address origin) internal {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = _sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? _pairFor(output, path[i + 2]) : _to;
            ProjectXPair(_pairFor(input, output)).swap(amount0Out, amount1Out, to, origin, "");
        }
    }

    function _quoteLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        address pair = ProjectXFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            (uint256 reserveA, uint256 reserveB) = _getReserves(tokenA, tokenB);
            if (reserveA == 0 && reserveB == 0) {
                (amountA, amountB) = (amountADesired, amountBDesired);
            } else {
                amountB = PoolMath.quote(amountADesired, reserveA, reserveB);
                if (amountB <= amountBDesired) {
                    require(amountB >= amountBMin, "ProjectXRouter: INSUFFICIENT_B_AMOUNT");
                    amountA = amountADesired;
                } else {
                    amountA = PoolMath.quote(amountBDesired, reserveB, reserveA);
                    require(amountA <= amountADesired && amountA >= amountAMin, "ProjectXRouter: INSUFFICIENT_A_AMOUNT");
                    amountB = amountBDesired;
                }
            }
        }
    }

    function _getReserves(address tokenA, address tokenB) internal view returns (uint256 reserveA, uint256 reserveB) {
        (address token0,) = _sortTokens(tokenA, tokenB);
        address pair = _pairFor(tokenA, tokenB);
        (uint256 r0, uint256 r1) = ProjectXPair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (r0, r1) : (r1, r0);
    }

    function _pairFor(address tokenA, address tokenB) internal view returns (address pair) {
        pair = ProjectXFactory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "ProjectXRouter: PAIR_NOT_EXISTS");
    }

    function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }
}
