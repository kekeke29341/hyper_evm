// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MockERC20} from "./MockERC20.sol";
import {IProjectXNPM} from "../interfaces/IProjectXNPM.sol";

/// @title MockProjectXNPM — local/test Project X NPM stub
contract MockProjectXNPM is ERC721, IProjectXNPM {
    using SafeERC20 for IERC20;

    uint256 private _nextId = 1;
    bool public creditWithdrawals;

    // Test knobs emulating real pool behavior on increaseLiquidity:
    // - leftover: amounts NOT pulled from the caller (ratio mismatch leftovers)
    // - zero-liquidity thresholds: a nonzero desired amount below the threshold reverts,
    //   like a V3 pool.mint computing liquidity == 0 from a dust-sized side
    // - revertOnIncreaseCall: force the Nth increaseLiquidity call to revert
    uint256 public increaseLeftover0;
    uint256 public increaseLeftover1;
    uint256 public zeroLiquidityThreshold0;
    uint256 public zeroLiquidityThreshold1;
    uint256 public increaseCallCount;
    uint256 public revertOnIncreaseCall;

    struct Position {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    mapping(uint256 => Position) public storedPositions;

    constructor() ERC721("MockProjectXNPM", "MPNPM") {}

    function setCreditWithdrawals(bool enabled) external {
        creditWithdrawals = enabled;
    }

    function setIncreaseLeftover(uint256 leftover0, uint256 leftover1) external {
        increaseLeftover0 = leftover0;
        increaseLeftover1 = leftover1;
    }

    function setZeroLiquidityThresholds(uint256 threshold0, uint256 threshold1) external {
        zeroLiquidityThreshold0 = threshold0;
        zeroLiquidityThreshold1 = threshold1;
    }

    function setRevertOnIncreaseCall(uint256 callIndex) external {
        revertOnIncreaseCall = callIndex;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        tokenId = _nextId++;
        _mint(params.recipient, tokenId);

        if (params.amount0Desired > 0) {
            IERC20(params.token0).safeTransferFrom(msg.sender, address(this), params.amount0Desired);
            amount0 = params.amount0Desired;
        }
        if (params.amount1Desired > 0) {
            IERC20(params.token1).safeTransferFrom(msg.sender, address(this), params.amount1Desired);
            amount1 = params.amount1Desired;
        }

        liquidity = uint128(amount0 + amount1);
        storedPositions[tokenId] = Position({
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            tokensOwed0: 0,
            tokensOwed1: 0
        });
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        returns (uint128 liquidityAdded, uint256 amount0, uint256 amount1)
    {
        Position storage p = storedPositions[params.tokenId];
        require(p.liquidity > 0, "MockNPM: NO_POSITION");

        increaseCallCount++;
        if (revertOnIncreaseCall != 0 && increaseCallCount == revertOnIncreaseCall) {
            revert("MockNPM: FORCED_REVERT");
        }
        require(
            params.amount0Desired == 0 || params.amount0Desired >= zeroLiquidityThreshold0,
            "MockNPM: ZERO_LIQUIDITY"
        );
        require(
            params.amount1Desired == 0 || params.amount1Desired >= zeroLiquidityThreshold1,
            "MockNPM: ZERO_LIQUIDITY"
        );

        if (params.amount0Desired > 0) {
            amount0 = params.amount0Desired > increaseLeftover0 ? params.amount0Desired - increaseLeftover0 : 0;
            if (amount0 > 0) IERC20(p.token0).safeTransferFrom(msg.sender, address(this), amount0);
        }
        if (params.amount1Desired > 0) {
            amount1 = params.amount1Desired > increaseLeftover1 ? params.amount1Desired - increaseLeftover1 : 0;
            if (amount1 > 0) IERC20(p.token1).safeTransferFrom(msg.sender, address(this), amount1);
        }

        liquidityAdded = uint128(amount0 + amount1);
        p.liquidity += liquidityAdded;
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        Position storage p = storedPositions[params.tokenId];
        require(p.liquidity > 0, "MockNPM: NO_LIQUIDITY");
        require(params.liquidity <= p.liquidity, "MockNPM: EXCESS");

        uint256 bal0 = IERC20(p.token0).balanceOf(address(this));
        uint256 bal1 = IERC20(p.token1).balanceOf(address(this));

        amount0 = (bal0 * params.liquidity) / p.liquidity;
        amount1 = (bal1 * params.liquidity) / p.liquidity;

        if (creditWithdrawals) {
            p.tokensOwed0 += uint128(amount0);
            p.tokensOwed1 += uint128(amount1);
        } else {
            if (amount0 > 0) IERC20(p.token0).safeTransfer(msg.sender, amount0);
            if (amount1 > 0) IERC20(p.token1).safeTransfer(msg.sender, amount1);
        }

        p.liquidity -= params.liquidity;
    }

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        Position storage p = storedPositions[params.tokenId];
        amount0 = p.tokensOwed0;
        amount1 = p.tokensOwed1;
        if (amount0 > 0) IERC20(p.token0).safeTransfer(params.recipient, amount0);
        if (amount1 > 0) IERC20(p.token1).safeTransfer(params.recipient, amount1);
        p.tokensOwed0 = 0;
        p.tokensOwed1 = 0;
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Position storage p = storedPositions[tokenId];
        return (
            0,
            address(0),
            p.token0,
            p.token1,
            p.fee,
            p.tickLower,
            p.tickUpper,
            p.liquidity,
            0,
            0,
            p.tokensOwed0,
            p.tokensOwed1
        );
    }

    /// @dev Test helper — simulate fee accrual. Pulls from caller when approved; otherwise mints (MockERC20 only).
    function accrueFees(uint256 tokenId, uint128 amount0, uint128 amount1) external {
        Position storage p = storedPositions[tokenId];
        if (amount0 > 0) {
            _fundOwed(p.token0, amount0);
            p.tokensOwed0 += amount0;
        }
        if (amount1 > 0) {
            _fundOwed(p.token1, amount1);
            p.tokensOwed1 += amount1;
        }
    }

    function _fundOwed(address token, uint128 amount) internal {
        uint256 allowance = IERC20(token).allowance(msg.sender, address(this));
        if (allowance >= amount) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            return;
        }
        MockERC20(token).mint(address(this), amount);
    }
}
