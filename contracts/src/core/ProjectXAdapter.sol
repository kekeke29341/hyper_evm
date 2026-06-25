// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IProjectXNPM} from "../interfaces/IProjectXNPM.sol";
import {IUniswapV3Pool} from "../interfaces/IUniswapV3Pool.sol";
import {ProjectXConstants} from "../libraries/ProjectXConstants.sol";
import {ProjectXPrice} from "../libraries/ProjectXPrice.sol";
import {LiquidityAmounts} from "../libraries/LiquidityAmounts.sol";
import {TickMath} from "../libraries/TickMath.sol";

/// @title ProjectXAdapter — manages Project X concentrated liquidity positions
contract ProjectXAdapter is Ownable, IERC721Receiver {
    using SafeERC20 for IERC20;

    IProjectXNPM public immutable npm;
    IERC20 public immutable token0;
    IERC20 public immutable token1;
    IERC20 public immutable usdc;
    IERC20 public immutable whype;
    uint24 public immutable fee;
    address public vault;
    IUniswapV3Pool public pool;

    uint256 public positionTokenId;
    int24 public tickLower;
    int24 public tickUpper;

    /// @notice Last reference price: USDC (6 dec) per 1 HYPE (1e18 wei)
    uint256 public refPriceUsdc6PerHype18;

    uint256 public upperRangeBps = ProjectXConstants.UPPER_RANGE_BPS;
    uint256 public lowerRangeBps = ProjectXConstants.LOWER_RANGE_BPS;
    uint256 public slippageBps = 50; // 0.5% min on remint after rebalance

    event PositionMinted(uint256 tokenId, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event PositionIncreased(uint256 tokenId, uint128 liquidityAdded);
    event PositionRebalanced(uint256 tokenId, int24 tickLower, int24 tickUpper);
    event FeesCollected(uint256 amount0, uint256 amount1);
    event LiquidityWithdrawn(uint256 amount0, uint256 amount1);
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    modifier onlyVault() {
        require(msg.sender == vault, "ProjectXAdapter: NOT_VAULT");
        _;
    }

    constructor(
        address _npm,
        address _token0,
        address _token1,
        address _usdc,
        address _whype,
        uint24 _fee,
        address _owner
    ) Ownable(_owner) {
        require(
            _npm != address(0) && _token0 != address(0) && _token1 != address(0) && _usdc != address(0)
                && _whype != address(0),
            "ProjectXAdapter: ZERO"
        );
        npm = IProjectXNPM(_npm);
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
        usdc = IERC20(_usdc);
        whype = IERC20(_whype);
        fee = _fee;
        refPriceUsdc6PerHype18 = 42e6 * 1e12;
    }

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "ProjectXAdapter: ZERO");
        vault = _vault;
    }

    /// @notice Set Project X pool for position-specific NAV (required on mainnet shared NPM)
    function setPool(address _pool) external onlyOwner {
        pool = IUniswapV3Pool(_pool);
    }

    function setRangeBps(uint256 _upperBps, uint256 _lowerBps) external onlyOwner {
        require(_upperBps > 0 && _lowerBps > 0, "ProjectXAdapter: INVALID_RANGE");
        upperRangeBps = _upperBps;
        lowerRangeBps = _lowerBps;
    }

    /// @notice USDC-equivalent value of this adapter's Project X position
    /// @dev Uses pool slot0 + position liquidity when `pool` is set; falls back to NPM balances for dedicated mock NPM
    function totalAssetsUsdc(uint256 priceUsdc6PerHype18) external view returns (uint256) {
        if (positionTokenId == 0) return 0;

        (,,,,, int24 posTickLower, int24 posTickUpper, uint128 positionLiq,,,,) = npm.positions(positionTokenId);
        if (positionLiq == 0) return 0;

        uint256 amount0;
        uint256 amount1;

        if (address(pool) != address(0)) {
            (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
            uint160 sqrtLower = TickMath.getSqrtRatioAtTick(posTickLower);
            uint160 sqrtUpper = TickMath.getSqrtRatioAtTick(posTickUpper);
            (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
                sqrtPriceX96, sqrtLower, sqrtUpper, positionLiq
            );
        } else {
            // Dedicated mock/test NPM — all balances belong to this position
            amount0 = token0.balanceOf(address(npm));
            amount1 = token1.balanceOf(address(npm));
        }

        return _amountsToUsdc(amount0, amount1, priceUsdc6PerHype18);
    }

    /// @notice Deposit tokens already held by adapter (vault transfers first)
    function deposit(uint256 amount0, uint256 amount1) external onlyVault returns (uint128 liquidityAdded) {
        if (amount0 > 0) token0.forceApprove(address(npm), amount0);
        if (amount1 > 0) token1.forceApprove(address(npm), amount1);

        if (positionTokenId == 0) {
            uint256 price = _priceFromAmounts(amount0, amount1);
            if (price > 0) refPriceUsdc6PerHype18 = price;

            (int24 lower, int24 upper) = _ticksFromPrice(refPriceUsdc6PerHype18);
            tickLower = lower;
            tickUpper = upper;

            (uint256 tokenId, uint128 liq,,) = npm.mint(
                IProjectXNPM.MintParams({
                    token0: address(token0),
                    token1: address(token1),
                    fee: fee,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    amount0Desired: amount0,
                    amount1Desired: amount1,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: address(this),
                    deadline: block.timestamp + 1 hours
                })
            );
            positionTokenId = tokenId;
            liquidityAdded = liq;
            emit PositionMinted(tokenId, tickLower, tickUpper, liq);
        } else {
            (uint128 liq,,) = npm.increaseLiquidity(
                IProjectXNPM.IncreaseLiquidityParams({
                    tokenId: positionTokenId,
                    amount0Desired: amount0,
                    amount1Desired: amount1,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp + 1 hours
                })
            );
            liquidityAdded = liq;
            emit PositionIncreased(positionTokenId, liq);
        }
    }

    /// @notice Pro-rata LP withdrawal to vault (shares / totalShares of position liquidity)
    function withdrawProRata(uint256 shares, uint256 totalShares)
        external
        onlyVault
        returns (uint256 amount0, uint256 amount1)
    {
        require(positionTokenId != 0 && totalShares > 0 && shares > 0, "ProjectXAdapter: INVALID");
        (,,,,,,, uint128 liq,,,,) = npm.positions(positionTokenId);
        require(liq > 0, "ProjectXAdapter: NO_LIQUIDITY");

        uint128 liquidityToRemove = uint128((uint256(liq) * shares) / totalShares);
        if (liquidityToRemove == 0) return (0, 0);

        (amount0, amount1) = npm.decreaseLiquidity(
            IProjectXNPM.DecreaseLiquidityParams({
                tokenId: positionTokenId,
                liquidity: liquidityToRemove,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 1 hours
            })
        );

        if (amount0 > 0) token0.safeTransfer(vault, amount0);
        if (amount1 > 0) token1.safeTransfer(vault, amount1);
        emit LiquidityWithdrawn(amount0, amount1);
    }

    /// @notice Keeper recenter: +upperRangeBps / -lowerRangeBps around reference price
    function rebalance(uint256 priceUsdc6PerHype18) external onlyVault {
        require(positionTokenId != 0, "ProjectXAdapter: NO_POSITION");
        require(priceUsdc6PerHype18 > 0, "ProjectXAdapter: ZERO_PRICE");
        refPriceUsdc6PerHype18 = priceUsdc6PerHype18;

        (,,,,,,, uint128 liq,,,,) = npm.positions(positionTokenId);
        if (liq > 0) {
            npm.decreaseLiquidity(
                IProjectXNPM.DecreaseLiquidityParams({
                    tokenId: positionTokenId,
                    liquidity: liq,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp + 1 hours
                })
            );
        }

        (int24 lower, int24 upper) = _ticksFromPrice(refPriceUsdc6PerHype18);
        tickLower = lower;
        tickUpper = upper;

        uint256 bal0 = token0.balanceOf(address(this));
        uint256 bal1 = token1.balanceOf(address(this));
        if (bal0 > 0) token0.forceApprove(address(npm), bal0);
        if (bal1 > 0) token1.forceApprove(address(npm), bal1);

        if (bal0 > 0 || bal1 > 0) {
            uint256 min0 = (bal0 * (ProjectXConstants.BPS - slippageBps)) / ProjectXConstants.BPS;
            uint256 min1 = (bal1 * (ProjectXConstants.BPS - slippageBps)) / ProjectXConstants.BPS;
            (uint256 newId,,,) = npm.mint(
                IProjectXNPM.MintParams({
                    token0: address(token0),
                    token1: address(token1),
                    fee: fee,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    amount0Desired: bal0,
                    amount1Desired: bal1,
                    amount0Min: min0,
                    amount1Min: min1,
                    recipient: address(this),
                    deadline: block.timestamp + 1 hours
                })
            );
            positionTokenId = newId;
        }

        emit PositionRebalanced(positionTokenId, tickLower, tickUpper);
    }

    /// @notice Recover tokens idle on this adapter (including mistaken WHYPE/USDC sends).
    /// @dev Idle balances are not included in totalAssetsUsdc(); NPM position liquidity is untouched.
    function recoverToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "ProjectXAdapter: ZERO");
        require(amount > 0, "ProjectXAdapter: ZERO_AMOUNT");
        token.safeTransfer(to, amount);
        emit TokenRecovered(address(token), to, amount);
    }

    /// @notice Collect accrued fees to vault
    function collectFees() external onlyVault returns (uint256 amount0, uint256 amount1) {
        require(positionTokenId != 0, "ProjectXAdapter: NO_POSITION");
        (amount0, amount1) = npm.collect(
            IProjectXNPM.CollectParams({
                tokenId: positionTokenId,
                recipient: vault,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        emit FeesCollected(amount0, amount1);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _amountsToUsdc(uint256 amount0, uint256 amount1, uint256 priceUsdc6PerHype18)
        internal
        view
        returns (uint256)
    {
        uint256 usdcAmt;
        uint256 hypeAmt;
        if (address(token0) == address(usdc)) {
            usdcAmt = amount0;
            hypeAmt = amount1;
        } else {
            usdcAmt = amount1;
            hypeAmt = amount0;
        }
        return usdcAmt + _hypeToUsdc(hypeAmt, priceUsdc6PerHype18);
    }

    /// @dev refPrice is humanPrice*1e18 (= USDC6/HYPE * 1e12); hypeAmount is 1e18-wei.
    ///      USDC token amount (6-dec) = hypeAmount * refPrice / 1e30 (1e18 wei + 1e12 price scale).
    function _hypeToUsdc(uint256 hypeAmount, uint256 priceUsdc6PerHype18) internal pure returns (uint256) {
        if (hypeAmount == 0 || priceUsdc6PerHype18 == 0) return 0;
        return (hypeAmount * priceUsdc6PerHype18) / 1e30;
    }

    function _priceFromAmounts(uint256 amount0, uint256 amount1) internal view returns (uint256) {
        if (amount0 == 0 || amount1 == 0) return refPriceUsdc6PerHype18;
        uint256 usdcAmt;
        uint256 hypeAmt;
        if (address(token0) == address(usdc)) {
            usdcAmt = amount0;
            hypeAmt = amount1;
        } else {
            usdcAmt = amount1;
            hypeAmt = amount0;
        }
        if (hypeAmt == 0) return refPriceUsdc6PerHype18;
        // refPrice canonical scale = humanPrice*1e18 = (USDC6/HYPE)*1e12.
        // usdcAmt is 6-dec, hypeAmt is 1e18-wei → multiply by 1e30 to land on the 1e18 scale.
        return (usdcAmt * 1e30) / hypeAmt;
    }

    function _ticksFromPrice(uint256 priceUsdc6PerHype18) internal view returns (int24 lower, int24 upper) {
        bool usdcIsToken0 = address(token0) == address(usdc);
        return ProjectXPrice.ticksFromRefPrice(
            priceUsdc6PerHype18, usdcIsToken0, upperRangeBps, lowerRangeBps
        );
    }
}
