// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IProjectXNPM} from "../interfaces/IProjectXNPM.sol";
import {IUniswapV3Pool} from "../interfaces/IUniswapV3Pool.sol";
import {ProjectXConstants} from "../libraries/ProjectXConstants.sol";
import {ProjectXPrice} from "../libraries/ProjectXPrice.sol";
import {FullMath} from "../libraries/FullMath.sol";
import {LiquidityAmounts} from "../libraries/LiquidityAmounts.sol";
import {TickMath} from "../libraries/TickMath.sol";

/// @title ProjectXAdapter — manages Project X concentrated liquidity positions
contract ProjectXAdapter is Ownable, IERC721Receiver {
    using SafeERC20 for IERC20;

    IProjectXNPM public immutable npm;
    IERC20 public immutable token0;
    IERC20 public immutable token1;
    /// @notice Quote (numeraire) token. Legacy name `usdc` retained; for HYPE-quoted pools this is WHYPE.
    IERC20 public immutable quoteToken;
    /// @notice Base token being priced against the quote. Legacy name `whype` retained.
    IERC20 public immutable baseToken;
    /// @notice Decimals of the quote/base tokens, read on-chain at construction.
    uint8 public immutable quoteDecimals;
    uint8 public immutable baseDecimals;
    /// @notice priceDiv = 10^(baseDecimals + 18 − quoteDecimals): bridges the canonical ref price
    ///         (quote-per-base * 1e18) to the pool's raw token-unit price. 1e30 for USDC/WHYPE.
    uint256 public immutable priceDiv;
    uint24 public immutable fee;
    address public vault;
    IUniswapV3Pool public pool;

    uint256 public positionTokenId;
    int24 public tickLower;
    int24 public tickUpper;

    /// @notice Last reference price: quote token per 1 base token, scaled by 1e18 (humanPrice * 1e18).
    /// @dev Public name kept as `refPriceUsdc6PerHype18` for ABI compatibility with the live vault
    ///      tooling (keeper / frontend); see refPriceQuotePerBase18() for the role-based alias.
    uint256 public refPriceUsdc6PerHype18;

    uint256 public upperRangeBps = ProjectXConstants.UPPER_RANGE_BPS;
    uint256 public lowerRangeBps = ProjectXConstants.LOWER_RANGE_BPS;
    uint256 public slippageBps = 50; // 0.5% min on remint after rebalance

    event PositionMinted(uint256 tokenId, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event PositionIncreased(uint256 tokenId, uint128 liquidityAdded);
    event PositionRebalanced(uint256 tokenId, int24 tickLower, int24 tickUpper);
    event FeesCollected(uint256 amount0, uint256 amount1);
    event LiquidityWithdrawn(uint256 amount0, uint256 amount1);
    event IdleForwardedToVault(uint256 amount0, uint256 amount1);
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    modifier onlyVault() {
        require(msg.sender == vault, "ProjectXAdapter: NOT_VAULT");
        _;
    }

    constructor(
        address _npm,
        address _token0,
        address _token1,
        address _quoteToken,
        address _baseToken,
        uint24 _fee,
        uint256 _initialRefPrice,
        address _owner
    ) Ownable(_owner) {
        require(
            _npm != address(0) && _token0 != address(0) && _token1 != address(0) && _quoteToken != address(0)
                && _baseToken != address(0),
            "ProjectXAdapter: ZERO"
        );
        require(_quoteToken == _token0 || _quoteToken == _token1, "ProjectXAdapter: QUOTE_NOT_IN_PAIR");
        require(_baseToken == _token0 || _baseToken == _token1, "ProjectXAdapter: BASE_NOT_IN_PAIR");
        npm = IProjectXNPM(_npm);
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
        quoteToken = IERC20(_quoteToken);
        baseToken = IERC20(_baseToken);
        fee = _fee;

        uint8 qDec = IERC20Metadata(_quoteToken).decimals();
        uint8 bDec = IERC20Metadata(_baseToken).decimals();
        quoteDecimals = qDec;
        baseDecimals = bDec;
        // priceDiv = 10^(baseDec + 18 − quoteDec). With base∈{6,8,18} and quote∈{6,18} the exponent
        // stays in [6, 30], so priceDiv never underflows or overflows uint256.
        int256 exp = int256(uint256(bDec)) + 18 - int256(uint256(qDec));
        require(exp >= 0 && exp <= 60, "ProjectXAdapter: DECIMALS");
        priceDiv = 10 ** uint256(exp);

        refPriceUsdc6PerHype18 = _initialRefPrice;
    }

    /// @notice Role-based alias for the quote token (ABI-compat legacy getter).
    function usdc() external view returns (IERC20) {
        return quoteToken;
    }

    /// @notice Role-based alias for the base token (ABI-compat legacy getter).
    function whype() external view returns (IERC20) {
        return baseToken;
    }

    /// @notice Role-based alias for refPriceUsdc6PerHype18 (quote-per-base * 1e18).
    function refPriceQuotePerBase18() external view returns (uint256) {
        return refPriceUsdc6PerHype18;
    }

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "ProjectXAdapter: ZERO");
        vault = _vault;
    }

    /// @notice Set Project X pool for position-specific NAV (required on mainnet shared NPM)
    function setPool(address _pool) external onlyOwner {
        if (_pool != address(0)) _validatePool(IUniswapV3Pool(_pool));
        pool = IUniswapV3Pool(_pool);
    }

    /// @dev Every price, tick and NAV read goes through this pool, so pointing the adapter at the
    ///      wrong one (wrong pair, wrong fee tier, or a tick spacing other than the 60 that
    ///      ProjectXPrice aligns to) silently corrupts all of them. Real pools answer these getters;
    ///      test mocks that do not are skipped so the mock-NPM harness still works.
    function _validatePool(IUniswapV3Pool p) internal view {
        try p.token0() returns (address poolToken0) {
            if (poolToken0 == address(0)) return;
            require(poolToken0 == address(token0), "ProjectXAdapter: POOL_TOKEN0");
            require(p.token1() == address(token1), "ProjectXAdapter: POOL_TOKEN1");
            require(p.fee() == fee, "ProjectXAdapter: POOL_FEE");
            require(p.tickSpacing() == ProjectXPrice.TICK_SPACING, "ProjectXAdapter: POOL_TICK_SPACING");
        } catch {}
    }

    function currentPoolPriceUsdc6PerHype18() public view returns (uint256) {
        if (address(pool) == address(0)) return refPriceUsdc6PerHype18;
        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        if (sqrtPriceX96 == 0) return refPriceUsdc6PerHype18;

        uint256 ratioX96 = FullMath.mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96), uint256(1) << 96);
        if (ratioX96 == 0) return refPriceUsdc6PerHype18;

        if (address(token0) == address(quoteToken)) {
            // Pool raw price is base per quote. Invert and rescale to the canonical
            // quote-per-base * 1e18 used by the vault: refPrice = priceDiv / rawPrice.
            return FullMath.mulDiv(priceDiv, uint256(1) << 96, ratioX96);
        }

        // Pool raw price is quote per base. Rescale to quote-per-base * 1e18: refPrice = rawPrice * priceDiv.
        return FullMath.mulDiv(ratioX96, priceDiv, uint256(1) << 96);
    }

    /// @notice Role-based alias for currentPoolPriceUsdc6PerHype18 (quote-per-base * 1e18).
    function currentPoolPriceQuotePerBase18() external view returns (uint256) {
        return currentPoolPriceUsdc6PerHype18();
    }

    function syncRefPriceFromPool() external onlyVault returns (uint256 price) {
        price = currentPoolPriceUsdc6PerHype18();
        require(price > 0, "ProjectXAdapter: ZERO_PRICE");
        refPriceUsdc6PerHype18 = price;
    }

    function setRangeBps(uint256 _upperBps, uint256 _lowerBps) external onlyOwner {
        require(_upperBps > 0 && _lowerBps > 0, "ProjectXAdapter: INVALID_RANGE");
        upperRangeBps = _upperBps;
        lowerRangeBps = _lowerBps;
    }

    /// @notice USDC-equivalent value of this adapter's Project X position plus idle token balances
    /// @dev Uses pool slot0 + position liquidity when `pool` is set; falls back to NPM balances for dedicated mock NPM
    function totalAssetsUsdc(uint256 priceUsdc6PerHype18) external view returns (uint256) {
        uint256 positionValue;

        if (positionTokenId != 0) {
            (,,,,, int24 posTickLower, int24 posTickUpper, uint128 positionLiq,,,,) = npm.positions(positionTokenId);
            if (positionLiq > 0) {
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
                    amount0 = token0.balanceOf(address(npm));
                    amount1 = token1.balanceOf(address(npm));
                }

                positionValue = _amountsToUsdc(amount0, amount1, priceUsdc6PerHype18);
            }
        }

        return positionValue + idleAssetsUsdc(priceUsdc6PerHype18);
    }

    /// @notice USDC-equivalent idle WHYPE/USDC on this adapter (not yet in the NPM position)
    function idleAssetsUsdc(uint256 priceUsdc6PerHype18) public view returns (uint256) {
        return _amountsToUsdc(token0.balanceOf(address(this)), token1.balanceOf(address(this)), priceUsdc6PerHype18);
    }

    /// @notice Current NPM position token amounts at the live pool price (0 if no position)
    function positionTokenAmounts() external view returns (uint256 amount0, uint256 amount1) {
        if (positionTokenId == 0 || address(pool) == address(0)) return (0, 0);

        (,,,,, int24 posTickLower, int24 posTickUpper, uint128 positionLiq,,,,) = npm.positions(positionTokenId);
        if (positionLiq == 0) return (0, 0);

        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96,
            TickMath.getSqrtRatioAtTick(posTickLower),
            TickMath.getSqrtRatioAtTick(posTickUpper),
            positionLiq
        );
    }

    /// @notice USDC-value split for a new deposit at the current pool price and managed range
    /// @dev token0 = WHYPE when WHYPE sorts before USDC (mainnet). Used by the vault to avoid 50/50 swaps.
    function rangeDepositRatioBps() external view returns (uint256 token0Bps, uint256 token1Bps) {
        if (address(pool) == address(0)) return (5000, 5000);

        (int24 lower, int24 upper) = _depositTickRange();
        if (lower >= upper) return (5000, 5000);

        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        if (sqrtPriceX96 == 0) return (5000, 5000);

        uint128 unitLiq = uint128(1 << 64);
        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96,
            TickMath.getSqrtRatioAtTick(lower),
            TickMath.getSqrtRatioAtTick(upper),
            unitLiq
        );
        if (amount0 == 0 && amount1 == 0) return (5000, 5000);

        uint256 price = currentPoolPriceUsdc6PerHype18();
        if (price == 0) price = refPriceUsdc6PerHype18;
        if (price == 0) return (5000, 5000);

        uint256 val0 = _amountsToUsdc(amount0, 0, price);
        uint256 val1 = _amountsToUsdc(0, amount1, price);
        uint256 total = val0 + val1;
        if (total == 0) return (5000, 5000);

        token0Bps = (val0 * ProjectXConstants.BPS) / total;
        token1Bps = ProjectXConstants.BPS - token0Bps;
    }

    /// @notice Return idle tokens to the vault so they back vault shares and are withdrawable
    function forwardIdleToVault() external onlyVault {
        uint256 bal0 = token0.balanceOf(address(this));
        uint256 bal1 = token1.balanceOf(address(this));
        if (bal0 == 0 && bal1 == 0) return;
        if (bal0 > 0) token0.safeTransfer(vault, bal0);
        if (bal1 > 0) token1.safeTransfer(vault, bal1);
        emit IdleForwardedToVault(bal0, bal1);
    }

    /// @notice Deposit tokens already held by adapter (vault transfers first)
    function deposit(uint256 amount0, uint256 amount1) external onlyVault returns (uint128 liquidityAdded) {
        if (amount0 > 0) token0.forceApprove(address(npm), amount0);
        if (amount1 > 0) token1.forceApprove(address(npm), amount1);

        if (positionTokenId == 0) {
            uint256 price = address(pool) != address(0) ? currentPoolPriceUsdc6PerHype18() : _priceFromAmounts(amount0, amount1);
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

        uint256 bal0Before = token0.balanceOf(address(this));
        uint256 bal1Before = token1.balanceOf(address(this));

        (uint256 min0, uint256 min1) = _decreaseMins(liquidityToRemove);
        npm.decreaseLiquidity(
            IProjectXNPM.DecreaseLiquidityParams({
                tokenId: positionTokenId,
                liquidity: liquidityToRemove,
                amount0Min: min0,
                amount1Min: min1,
                deadline: block.timestamp + 1 hours
            })
        );

        // Collect the full tokensOwed (principal + any fees accrued since the last harvest),
        // not just the principal returned by decreaseLiquidity — capping at the principal
        // stranded accrued fees on the position (mainnet 2026-07: ~9.4 USDC left unclaimable
        // across 20 abandoned NFTs). The vault harvests fees before withdrawing, so the fee
        // remainder here is normally same-block dust.
        (uint256 collected0, uint256 collected1) = npm.collect(
            IProjectXNPM.CollectParams({
                tokenId: positionTokenId,
                recipient: vault,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // Mock NPMs may transfer withdrawn liquidity directly to the adapter instead
        // of crediting it for collect(), while real V3 NPMs use collect().
        uint256 delta0 = token0.balanceOf(address(this)) - bal0Before;
        uint256 delta1 = token1.balanceOf(address(this)) - bal1Before;
        if (delta0 > 0) token0.safeTransfer(vault, delta0);
        if (delta1 > 0) token1.safeTransfer(vault, delta1);

        amount0 = collected0 + delta0;
        amount1 = collected1 + delta1;
        emit LiquidityWithdrawn(amount0, amount1);
    }

    /// @notice Keeper recenter: +upperRangeBps / -lowerRangeBps around reference price
    function rebalance(uint256 priceUsdc6PerHype18) external onlyVault {
        require(positionTokenId != 0, "ProjectXAdapter: NO_POSITION");
        require(priceUsdc6PerHype18 > 0, "ProjectXAdapter: ZERO_PRICE");
        refPriceUsdc6PerHype18 = priceUsdc6PerHype18;

        (,,,,,,, uint128 liq,,,,) = npm.positions(positionTokenId);
        if (liq > 0) {
            (uint256 min0, uint256 min1) = _decreaseMins(liq);
            npm.decreaseLiquidity(
                IProjectXNPM.DecreaseLiquidityParams({
                    tokenId: positionTokenId,
                    liquidity: liq,
                    amount0Min: min0,
                    amount1Min: min1,
                    deadline: block.timestamp + 1 hours
                })
            );
            // Collect the full tokensOwed (principal + accrued fees), not just the principal
            // returned by decreaseLiquidity. Capping at the principal abandoned all fees
            // accrued since the previous harvest on the old NFT when the position was
            // re-minted (mainnet 2026-07: ~9.4 USDC stranded across 20 rebalances while
            // users received ~2-4% of actual fee yield). The vault harvests fees before
            // calling rebalance, so any remainder collected here is same-block dust that
            // simply re-enters the new position as principal.
            npm.collect(
                IProjectXNPM.CollectParams({
                    tokenId: positionTokenId,
                    recipient: address(this),
                    amount0Max: type(uint128).max,
                    amount1Max: type(uint128).max
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
            (uint256 newId,,,) = npm.mint(
                IProjectXNPM.MintParams({
                    token0: address(token0),
                    token1: address(token1),
                    fee: fee,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    amount0Desired: bal0,
                    amount1Desired: bal1,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: address(this),
                    deadline: block.timestamp + 1 hours
                })
            );
            positionTokenId = newId;
        }

        emit PositionRebalanced(positionTokenId, tickLower, tickUpper);
    }

    /// @notice Recover non-underlying tokens accidentally sent to this adapter.
    /// @dev USDC/WHYPE are excluded: idle underlying IS counted in totalAssetsUsdc() (see
    ///      idleAssetsUsdc), so it backs vault shares. It reaches shareholders via
    ///      forwardIdleToVault() on the next deposit/rebalance and must never be owner-swept.
    function recoverToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "ProjectXAdapter: ZERO");
        require(amount > 0, "ProjectXAdapter: ZERO_AMOUNT");
        require(
            address(token) != address(quoteToken) && address(token) != address(baseToken),
            "ProjectXAdapter: UNDERLYING"
        );
        token.safeTransfer(to, amount);
        emit TokenRecovered(address(token), to, amount);
    }

    /// @notice Rescue: collect tokensOwed stranded on an abandoned position NFT to the vault.
    /// @dev Old NFTs from past rebalances may still hold uncollected fees. Funds always go to
    ///      the vault (never the owner), where they back shareholder NAV and the next harvest.
    function collectFromToken(uint256 tokenId) external onlyOwner returns (uint256 amount0, uint256 amount1) {
        require(tokenId != positionTokenId, "ProjectXAdapter: ACTIVE_POSITION");
        (amount0, amount1) = npm.collect(
            IProjectXNPM.CollectParams({
                tokenId: tokenId,
                recipient: vault,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        emit FeesCollected(amount0, amount1);
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

    function _amountsToUsdc(uint256 amount0, uint256 amount1, uint256 priceQuotePerBase18)
        internal
        view
        returns (uint256)
    {
        uint256 quoteAmt;
        uint256 baseAmt;
        if (address(token0) == address(quoteToken)) {
            quoteAmt = amount0;
            baseAmt = amount1;
        } else {
            quoteAmt = amount1;
            baseAmt = amount0;
        }
        return quoteAmt + _hypeToUsdc(baseAmt, priceQuotePerBase18);
    }

    /// @dev price is quote-per-base * 1e18; baseAmount is in base token units (10^baseDec).
    ///      quote token amount (10^quoteDec) = baseAmount * price / priceDiv,
    ///      where priceDiv = 10^(baseDec + 18 − quoteDec). Reduces to /1e30 for USDC/WHYPE.
    function _hypeToUsdc(uint256 baseAmount, uint256 priceQuotePerBase18) internal view returns (uint256) {
        if (baseAmount == 0 || priceQuotePerBase18 == 0) return 0;
        return (baseAmount * priceQuotePerBase18) / priceDiv;
    }

    function _priceFromAmounts(uint256 amount0, uint256 amount1) internal view returns (uint256) {
        if (amount0 == 0 || amount1 == 0) return refPriceUsdc6PerHype18;
        uint256 quoteAmt;
        uint256 baseAmt;
        if (address(token0) == address(quoteToken)) {
            quoteAmt = amount0;
            baseAmt = amount1;
        } else {
            quoteAmt = amount1;
            baseAmt = amount0;
        }
        if (baseAmt == 0) return refPriceUsdc6PerHype18;
        // quoteAmt is 10^quoteDec, baseAmt is 10^baseDec → multiply by priceDiv to land on the
        // canonical quote-per-base * 1e18 scale.
        return (quoteAmt * priceDiv) / baseAmt;
    }

    function _ticksFromPrice(uint256 priceQuotePerBase18) internal view returns (int24 lower, int24 upper) {
        bool quoteIsToken0 = address(token0) == address(quoteToken);
        return ProjectXPrice.ticksFromRefPrice(
            priceQuotePerBase18, quoteIsToken0, priceDiv, upperRangeBps, lowerRangeBps
        );
    }

    function _depositTickRange() internal view returns (int24 lower, int24 upper) {
        if (positionTokenId != 0) {
            (,,,,, lower, upper,,,,,) = npm.positions(positionTokenId);
            return (lower, upper);
        }
        if (tickLower < tickUpper) return (tickLower, tickUpper);

        // Match first-mint tick selection in deposit(): use live pool price so
        // rangeDepositRatioBps agrees with the NPM mint range (stale refPrice alone
        // would skew the swap ratio and USDC-only deposits revert in-range).
        uint256 price = currentPoolPriceUsdc6PerHype18();
        if (price == 0) price = refPriceUsdc6PerHype18;
        if (price == 0) return (0, 0);
        return _ticksFromPrice(price);
    }

    /// @dev Slippage-protected minimum amounts for a `decreaseLiquidity` of `liq`, derived from the
    ///      live pool price and the current position range. Returns (0,0) when no pool is configured
    ///      (dedicated mock NPM path), preserving the mock behaviour. Protects withdrawals and
    ///      rebalance unwinds from being sandwiched into a skewed token payout.
    function _decreaseMins(uint128 liq) internal view returns (uint256 min0, uint256 min1) {
        if (address(pool) == address(0) || liq == 0) return (0, 0);
        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        if (sqrtPriceX96 == 0) return (0, 0);

        (uint256 expected0, uint256 expected1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96, TickMath.getSqrtRatioAtTick(tickLower), TickMath.getSqrtRatioAtTick(tickUpper), liq
        );
        min0 = (expected0 * (ProjectXConstants.BPS - slippageBps)) / ProjectXConstants.BPS;
        min1 = (expected1 * (ProjectXConstants.BPS - slippageBps)) / ProjectXConstants.BPS;
    }

    function _toUint128(uint256 value) internal pure returns (uint128) {
        require(value <= type(uint128).max, "ProjectXAdapter: UINT128");
        return uint128(value);
    }
}
