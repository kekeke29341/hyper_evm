// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ProjectXAdapter} from "./ProjectXAdapter.sol";
import {HyperCoreOracle} from "./HyperCoreOracle.sol";
import {IProjectXSwapRouter} from "../interfaces/IProjectXSwapRouter.sol";
import {IUniswapV3Pool} from "../interfaces/IUniswapV3Pool.sol";
import {HyperCoreConstants} from "../libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../libraries/ProjectXConstants.sol";
import {FullMath} from "../libraries/FullMath.sol";
import {TickMath} from "../libraries/TickMath.sol";

/// @title HyperpoolVault — ERC20 vault shares; deposits to Project X via adapter
contract HyperpoolVault is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address private constant DEAD = address(0xdEaD);

    ProjectXAdapter public immutable adapter;
    HyperCoreOracle public immutable oracle;
    /// @notice Base token (legacy name `tokenWHYPE`; for HYPE-quoted vaults this is the priced asset).
    IERC20 public immutable tokenWHYPE;
    /// @notice Quote/numeraire token (legacy name `tokenUSDC`; WHYPE for HYPE-quoted vaults).
    IERC20 public immutable tokenUSDC;
    address public immutable merkleAirdrop;
    /// @notice priceDiv = 10^(baseDec + 18 − quoteDec), mirrored from the adapter. 1e30 for USDC/WHYPE.
    uint256 public immutable priceDiv;
    /// @dev Sides worth less than 0.01 quote token are left idle instead of LP-deposited (see _dropDustSide).
    ///      Quote-decimals-aware: 10^quoteDec / 100. For USDC (6 dec) this is 10_000, regression-exact.
    uint256 public immutable dustDepositQuote;
    /// @dev Shares burned to DEAD on the first deposit, hardening against the share-inflation attack.
    ///      Shares are denominated in the quote token, so this floor must scale with quote decimals:
    ///      10^quoteDec / 1000 = 0.001 quote. For USDC (6 dec) that is 1000 — the historical constant,
    ///      so the legacy pool is regression-exact — and 1e15 for an 18-decimal quote such as WHYPE,
    ///      where a flat 1000 wei would have been worth ~1e-15 HYPE and protected nothing.
    uint256 public immutable minimumVaultShares;

    uint32 public hypeOracleAssetId;
    uint256 public maxRebalanceDeviationBps = HyperCoreConstants.DEFAULT_REBALANCE_DEVIATION_BPS;

    /// @notice Pool TWAP entry guard (oracle-independent). 0 = disabled (legacy USDC/HYPE vaults).
    ///         HYPE-quoted vaults set a window (e.g. 900s) so deposits/rebalances are rejected when
    ///         the pool spot deviates from its TWAP by more than maxRebalanceDeviationBps.
    uint32 public twapWindow;
    /// @notice When true, an unavailable/insufficient-cardinality TWAP reverts entry (fail-closed);
    ///         when false the TWAP check fails open. Recommended true once cardinality is grown.
    bool public twapRequired;

    address public keeper;
    address public operatorWallet;
    address public ownerFeeWallet;
    address public swapRouter;
    uint256 public operatorFeeBps = ProjectXConstants.OPERATIONS_FEE_BPS;
    uint256 public ownerFeeBps = ProjectXConstants.OWNER_FEE_BPS;
    uint256 public feeSwapSlippageBps = 50;
    bool public convertHypeFeesToUsdc = true;

    /// @notice USDC reserved for user Merkle distribution (60% of collected USDC fees)
    uint256 public pendingUserRewards;

    event Deposit(address indexed caller, address indexed receiver, uint256 amountUSDC, uint256 shares);
    event DepositHype(address indexed caller, address indexed receiver, uint256 amountHype, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, uint256 shares, uint256 amountUSDC, uint256 amountHype);
    event FeesHarvested(
        uint256 usdcFees,
        uint256 hypeFees,
        uint256 usdcFromHypeSwap,
        uint256 operatorUsdc,
        uint256 ownerUsdc,
        uint256 operatorHype,
        uint256 ownerHype,
        uint256 userUsdc
    );
    event OwnerFeeWalletUpdated(address indexed wallet);
    event FeeSplitUpdated(uint256 operationsBps, uint256 ownerBps, uint256 userBps);
    event SwapRouterUpdated(address indexed router);
    event ConvertHypeFeesToUsdcUpdated(bool enabled);
    event FeeSwapSlippageBpsUpdated(uint256 bps);
    event SingleSidedDepositBalanced(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event KeeperUpdated(address indexed keeper);
    event OperatorWalletUpdated(address indexed wallet);
    event RebalanceDeviationBpsUpdated(uint256 bps);
    event ForeignTokenRecovered(address indexed token, address indexed to, uint256 amount);
    event IdleDeployed(uint256 amountHype, uint256 amountUsdc);
    event TwapWindowUpdated(uint32 window);
    event TwapRequiredUpdated(bool required);

    modifier onlyKeeperOrOwner() {
        require(msg.sender == keeper || msg.sender == owner(), "HyperpoolVault: NOT_KEEPER");
        _;
    }

    constructor(
        address _adapter,
        address _oracle,
        uint32 _hypeOracleAssetId,
        address _tokenWHYPE,
        address _tokenUSDC,
        address _merkleAirdrop,
        address _owner,
        address _keeper,
        address _operatorWallet,
        address _ownerFeeWallet
    ) ERC20("Hyperpool Vault Share", "hp-VAULT") Ownable(_owner) {
        require(
            _adapter != address(0) && _tokenWHYPE != address(0) && _tokenUSDC != address(0)
                && _merkleAirdrop != address(0),
            "HyperpoolVault: ZERO"
        );
        adapter = ProjectXAdapter(_adapter);
        // The vault's legacy `tokenUSDC`/`tokenWHYPE` slots carry the quote/base roles, and priceDiv
        // below is derived from the adapter's view of those roles. Swapping the two constructor
        // arguments would therefore invert every valuation while still deploying cleanly, so pin
        // them to the adapter rather than trusting the deploy script.
        require(
            _tokenUSDC == address(ProjectXAdapter(_adapter).quoteToken())
                && _tokenWHYPE == address(ProjectXAdapter(_adapter).baseToken()),
            "HyperpoolVault: ADAPTER_TOKENS"
        );
        oracle = HyperCoreOracle(_oracle);
        hypeOracleAssetId = _hypeOracleAssetId;
        tokenWHYPE = IERC20(_tokenWHYPE);
        tokenUSDC = IERC20(_tokenUSDC);
        merkleAirdrop = _merkleAirdrop;
        // Mirror the adapter's decimal-scaling so NAV/fee math shares one source of truth, and derive
        // the quote-denominated dust floor (0.01 quote token) that keeps single-sided deposits from
        // minting zero liquidity.
        priceDiv = ProjectXAdapter(_adapter).priceDiv();
        uint256 quoteUnit = 10 ** uint256(ProjectXAdapter(_adapter).quoteDecimals());
        dustDepositQuote = quoteUnit / 100;
        minimumVaultShares = quoteUnit / 1000;
        keeper = _keeper == address(0) ? _owner : _keeper;
        operatorWallet = _operatorWallet == address(0) ? _owner : _operatorWallet;
        ownerFeeWallet = _ownerFeeWallet == address(0) ? _owner : _ownerFeeWallet;
        emit KeeperUpdated(keeper);
        emit OperatorWalletUpdated(operatorWallet);
        emit OwnerFeeWalletUpdated(ownerFeeWallet);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setKeeper(address _keeper) external onlyOwner {
        require(_keeper != address(0), "HyperpoolVault: ZERO");
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setOperatorWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "HyperpoolVault: ZERO");
        operatorWallet = _wallet;
        emit OperatorWalletUpdated(_wallet);
    }

    function setOwnerFeeWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "HyperpoolVault: ZERO");
        ownerFeeWallet = _wallet;
        emit OwnerFeeWalletUpdated(_wallet);
    }

    function setFeeSplit(uint256 operationsBps, uint256 ownerBps) external onlyOwner {
        require(operationsBps + ownerBps <= ProjectXConstants.BPS, "HyperpoolVault: INVALID_BPS");
        operatorFeeBps = operationsBps;
        ownerFeeBps = ownerBps;
        emit FeeSplitUpdated(operationsBps, ownerBps, ProjectXConstants.BPS - operationsBps - ownerBps);
    }

    function setSwapRouter(address _router) external onlyOwner {
        swapRouter = _router;
        emit SwapRouterUpdated(_router);
    }

    function setConvertHypeFeesToUsdc(bool enabled) external onlyOwner {
        convertHypeFeesToUsdc = enabled;
        emit ConvertHypeFeesToUsdcUpdated(enabled);
    }

    function setFeeSwapSlippageBps(uint256 bps) external onlyOwner {
        require(bps <= ProjectXConstants.BPS, "HyperpoolVault: INVALID_BPS");
        feeSwapSlippageBps = bps;
        emit FeeSwapSlippageBpsUpdated(bps);
    }

    function setMaxRebalanceDeviationBps(uint256 bps) external onlyOwner {
        require(bps <= ProjectXConstants.BPS, "HyperpoolVault: INVALID_BPS");
        maxRebalanceDeviationBps = bps;
        emit RebalanceDeviationBpsUpdated(bps);
    }

    /// @notice Set the pool-TWAP entry guard window in seconds (0 disables the guard).
    function setTwapWindow(uint32 window) external onlyOwner {
        twapWindow = window;
        emit TwapWindowUpdated(window);
    }

    /// @notice When true, deposits/rebalances revert if the pool TWAP cannot be read (fail-closed).
    function setTwapRequired(bool required) external onlyOwner {
        twapRequired = required;
        emit TwapRequiredUpdated(required);
    }

    /// @notice Grow the pool's observation ring buffer so the TWAP window becomes queryable.
    function increasePoolObservationCardinality(uint16 next) external onlyKeeperOrOwner {
        IUniswapV3Pool pool = adapter.pool();
        require(address(pool) != address(0), "HyperpoolVault: NO_POOL");
        pool.increaseObservationCardinalityNext(next);
    }

    /// @notice Role-based alias for the quote/numeraire token (tokenUSDC).
    function quoteToken() external view returns (IERC20) {
        return tokenUSDC;
    }

    /// @notice Role-based alias for the base token (tokenWHYPE).
    function baseToken() external view returns (IERC20) {
        return tokenWHYPE;
    }

    /// @notice Net assets backing shares (excludes pending user reward liability)
    /// @dev Values the position and idle HYPE at the live pool price so the composition
    ///      (taken from the same slot0) and its valuation use one consistent price. Reverts
    ///      when no price is available rather than falling back to a hardcoded guess.
    function totalAssetsUsdc() public view returns (uint256) {
        uint256 price = adapter.currentPoolPriceUsdc6PerHype18();
        require(price > 0, "HyperpoolVault: NO_PRICE");

        uint256 vaultUsdc = tokenUSDC.balanceOf(address(this));
        uint256 vaultHype = tokenWHYPE.balanceOf(address(this));
        uint256 adapterUsdc = adapter.totalAssetsUsdc(price);

        uint256 gross = vaultUsdc + adapterUsdc + _hypeToUsdc(vaultHype, price);
        if (gross <= pendingUserRewards) return 0;
        return gross - pendingUserRewards;
    }

    function previewSharesForDeposit(uint256 amountUsdc) public view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 assets = totalAssetsUsdc();
        if (supply == 0 || assets == 0) {
            return amountUsdc > minimumVaultShares ? amountUsdc - minimumVaultShares : 0;
        }
        return (amountUsdc * supply) / assets;
    }

    /// @notice Primary deposit path — USDC only
    function depositUSDC(uint256 amount, address receiver) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(amount > 0 && receiver != address(0), "HyperpoolVault: INVALID");

        // Reject deposits while the pool spot price is dislocated from the HyperCore oracle:
        // NAV is derived from the pool composition, so a manipulated spot would let a depositor
        // mint mispriced shares and extract value via the price-immune pro-rata withdraw path.
        _enforceEntryPriceSane();

        // Price shares on the pre-deposit NAV, before the incoming funds land in the vault
        // (totalAssetsUsdc counts the vault's USDC balance, so reading it after the transfer
        //  would double-count this deposit and under-mint shares to the depositor).
        shares = previewSharesForDeposit(amount);
        require(shares > 0, "HyperpoolVault: ZERO_SHARES");

        tokenUSDC.safeTransferFrom(msg.sender, address(this), amount);

        _mintShares(shares, receiver);
        _deployToAdapter(0, amount);

        emit Deposit(msg.sender, receiver, amount, shares);
    }

    /// @notice Optional HYPE deposit — valued in USDC via adapter ref price
    function depositHYPE(uint256 amount, address receiver) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(amount > 0 && receiver != address(0), "HyperpoolVault: INVALID");

        _enforceEntryPriceSane();

        // Value incoming HYPE at the live pool price (kept close to the oracle by the guard above),
        // not the stale keeper refPrice, so a diverged refPrice cannot over- or under-credit the deposit.
        uint256 price = adapter.currentPoolPriceUsdc6PerHype18();
        require(price > 0, "HyperpoolVault: NO_PRICE");
        uint256 usdcValue = _hypeToUsdc(amount, price);
        require(usdcValue > 0, "HyperpoolVault: ZERO_VALUE");

        // Price shares on the pre-deposit NAV, before the incoming HYPE lands in the vault.
        shares = previewSharesForDeposit(usdcValue);
        require(shares > 0, "HyperpoolVault: ZERO_SHARES");

        tokenWHYPE.safeTransferFrom(msg.sender, address(this), amount);

        _mintShares(shares, receiver);
        _deployToAdapter(amount, 0);

        emit DepositHype(msg.sender, receiver, amount, shares);
    }

    function withdraw(uint256 shares, address receiver) external nonReentrant whenNotPaused returns (uint256 amountUsdc, uint256 amountHype) {
        require(shares > 0 && receiver != address(0), "HyperpoolVault: INVALID");
        require(balanceOf(msg.sender) >= shares, "HyperpoolVault: INSUFFICIENT_SHARES");

        // Harvest accrued fees first so the adapter's full-range collect below only moves
        // principal: without this, fees accrued since the last harvest would be paid out
        // entirely to this withdrawer instead of being split 7/60/33. Best-effort — a
        // failing fee swap must never block user withdrawals.
        _tryHarvestFees();

        uint256 supply = totalSupply();

        uint256 idleUsdcBefore = _withdrawableUsdc();
        uint256 idleHypeBefore = tokenWHYPE.balanceOf(address(this));

        (uint256 from0, uint256 from1) = adapter.withdrawProRata(shares, supply);
        (uint256 fromAdapterUsdc, uint256 fromAdapterHype) = _mapAdapterAmounts(from0, from1);

        amountUsdc = fromAdapterUsdc + (idleUsdcBefore * shares) / supply;
        amountHype = fromAdapterHype + (idleHypeBefore * shares) / supply;

        _burn(msg.sender, shares);

        if (amountUsdc > 0) tokenUSDC.safeTransfer(receiver, amountUsdc);
        if (amountHype > 0) tokenWHYPE.safeTransfer(receiver, amountHype);

        emit Withdraw(msg.sender, receiver, shares, amountUsdc, amountHype);
    }

    /// @notice Keeper/owner: collect Project X fees; optional HYPE→USDC swap; split 7% ops / 60% Merkle / 33% owner (all USDC when swap enabled)
    function harvestFees() external onlyKeeperOrOwner nonReentrant returns (uint256 userUsdc) {
        return _harvestFees();
    }

    /// @notice Self-call target so internal callers can harvest best-effort via try/catch.
    /// @dev try/catch only works on external calls; restricted to the vault itself.
    function selfHarvestFees() external returns (uint256 userUsdc) {
        require(msg.sender == address(this), "HyperpoolVault: NOT_SELF");
        return _harvestFees();
    }

    /// @dev Best-effort harvest for the withdraw/rebalance paths. A reverting harvest
    ///      (e.g. fee swap failure or missing position) must never block the caller;
    ///      with the adapter's full-range collect, un-harvested fees stay in the position
    ///      value instead of being stranded.
    function _tryHarvestFees() internal {
        try this.selfHarvestFees() returns (uint256) {} catch {}
    }

    function _harvestFees() internal returns (uint256 userUsdc) {
        (uint256 amount0, uint256 amount1) = adapter.collectFees();
        (uint256 usdcFees, uint256 hypeFees) = _mapAdapterAmounts(amount0, amount1);

        if (usdcFees == 0 && hypeFees == 0) return 0;

        uint256 usdcFromHypeSwap;
        if (hypeFees > 0 && convertHypeFeesToUsdc && swapRouter != address(0)) {
            usdcFromHypeSwap = _swapHypeFeesToUsdc(hypeFees);
            usdcFees += usdcFromHypeSwap;
            hypeFees = 0;
        }

        uint256 operatorUsdc = (usdcFees * operatorFeeBps) / ProjectXConstants.BPS;
        uint256 ownerUsdc = (usdcFees * ownerFeeBps) / ProjectXConstants.BPS;
        userUsdc = usdcFees - operatorUsdc - ownerUsdc;

        if (operatorUsdc > 0) {
            tokenUSDC.safeTransfer(operatorWallet, operatorUsdc);
        }
        if (ownerUsdc > 0) {
            tokenUSDC.safeTransfer(ownerFeeWallet, ownerUsdc);
        }

        uint256 operatorHype = (hypeFees * operatorFeeBps) / ProjectXConstants.BPS;
        uint256 ownerHype = (hypeFees * ownerFeeBps) / ProjectXConstants.BPS;
        if (operatorHype > 0) {
            tokenWHYPE.safeTransfer(operatorWallet, operatorHype);
        }
        if (ownerHype > 0) {
            tokenWHYPE.safeTransfer(ownerFeeWallet, ownerHype);
        }

        pendingUserRewards += userUsdc;
        emit FeesHarvested(usdcFees, hypeFees, usdcFromHypeSwap, operatorUsdc, ownerUsdc, operatorHype, ownerHype, userUsdc);
    }

    /// @notice Recover ERC20 tokens accidentally sent to the vault (not WHYPE / USDC).
    /// @dev Underlying assets back vault shares — use withdraw() for those. WHYPE/USDC mistaken
    ///      sends increase shareholder NAV; owner must hold shares to withdraw them.
    function recoverForeignToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "HyperpoolVault: ZERO");
        require(address(token) != address(tokenUSDC) && address(token) != address(tokenWHYPE), "HyperpoolVault: UNDERLYING");
        require(amount > 0, "HyperpoolVault: ZERO_AMOUNT");
        token.safeTransfer(to, amount);
        emit ForeignTokenRecovered(address(token), to, amount);
    }

    /// @notice Owner pulls pending user rewards to fund Merkle airdrop (airdrop address only)
    function pullPendingRewards(address to, uint256 amount) external onlyOwner {
        require(to == merkleAirdrop, "HyperpoolVault: NOT_AIRDROP");
        require(amount <= pendingUserRewards, "HyperpoolVault: INSUFFICIENT");
        pendingUserRewards -= amount;
        tokenUSDC.safeTransfer(to, amount);
    }

    /// @notice Keeper/owner: deploy idle USDC/KHYPE held by the vault into the LP position
    function deployIdle() external onlyKeeperOrOwner nonReentrant {
        uint256 hype = tokenWHYPE.balanceOf(address(this));
        uint256 usdc = _withdrawableUsdc();
        (hype, usdc) = _dropDustSide(hype, usdc);
        if (hype == 0 && usdc == 0) return;
        _enforceEntryPriceSane();
        _deployBalancedToAdapter(hype, usdc);
        _redeployVaultIdleOnce();
        emit IdleDeployed(hype, usdc);
    }

    /// @notice Keeper recenter; ref price must be within maxRebalanceDeviationBps of HyperCore oracle when available
    function rebalance(uint256 refPriceUsdc6PerHype18) external onlyKeeperOrOwner {
        require(refPriceUsdc6PerHype18 > 0, "HyperpoolVault: ZERO_PRICE");
        // Guard both the keeper's target price AND the live pool spot against the oracle, so a
        // sandwich that dislocates the pool right before this tx cannot force a burn/remint at a
        // manipulated ratio.
        _enforceEntryPriceSane();
        _enforceOracleDeviation(refPriceUsdc6PerHype18);
        // Harvest before re-minting the position so accrued fees are split 7/60/33 into
        // Cashdrop instead of being compounded back into the new position as principal.
        _tryHarvestFees();
        adapter.rebalance(refPriceUsdc6PerHype18);
        adapter.forwardIdleToVault();
    }

    /// @notice HyperCore oracle price as USDC(6) per 1 HYPE (1e18 wei); 0 if unavailable
    function oraclePriceUsdc6PerHype18() public view returns (uint256) {
        return _oraclePriceUsdc6PerHype18();
    }

    /// @dev Oracle price read that never reverts: returns 0 when the oracle is unset or the
    ///      HyperCore precompile is unavailable, so the entry guard can fail open in that case
    ///      (withdrawals stay price-immune regardless). Distinct from `_oraclePriceUsdc6PerHype18`,
    ///      which is intentionally strict for the keeper rebalance path.
    function _entryOraclePrice() internal view returns (uint256) {
        if (address(oracle) == address(0)) return 0;
        try oracle.tryGetOraclePrice(hypeOracleAssetId) returns (uint256 px, bool ok) {
            if (!ok || px == 0) return 0;
            return px * 1e14;
        } catch {
            return 0;
        }
    }

    /// @dev Reverts a deposit/rebalance when the pool spot price is dislocated. Two complementary
    ///      guards, either of which can be disabled by config:
    ///        1. HyperCore oracle deviation — legacy USDC/HYPE path. No-op when the oracle price is
    ///           unavailable (HYPE-quoted vaults deploy with the oracle unset, skipping this).
    ///        2. Pool TWAP deviation — oracle-independent, used by HYPE-quoted vaults (twapWindow>0).
    function _enforceEntryPriceSane() internal view {
        uint256 oraclePrice = _entryOraclePrice();
        if (oraclePrice != 0) {
            uint256 spot = adapter.currentPoolPriceUsdc6PerHype18();
            if (spot != 0) {
                uint256 diff = spot > oraclePrice ? spot - oraclePrice : oraclePrice - spot;
                require(
                    diff * ProjectXConstants.BPS / oraclePrice <= maxRebalanceDeviationBps,
                    "HyperpoolVault: ENTRY_PRICE_DEVIATION"
                );
            }
        }

        _enforcePoolTwap();
    }

    /// @dev Pool TWAP entry guard: compares the pool's current spot price against its
    ///      `twapWindow`-second time-weighted average. Reverts when they deviate by more than
    ///      `maxRebalanceDeviationBps`. Prices are compared in raw pool units (ratio of the two
    ///      squared sqrtPrices), so no decimal/priceDiv scaling is needed and it is numeraire-agnostic.
    ///      Disabled when twapWindow == 0 (legacy vaults). When the TWAP cannot be read, behaviour is
    ///      governed by `twapRequired` (fail-closed) vs fail-open.
    function _enforcePoolTwap() internal view {
        uint32 window = twapWindow;
        if (window == 0) return;

        IUniswapV3Pool pool = adapter.pool();
        if (address(pool) == address(0)) {
            require(!twapRequired, "HyperpoolVault: TWAP_NO_POOL");
            return;
        }

        (uint160 spotSqrt,,,,,,) = pool.slot0();
        if (spotSqrt == 0) {
            require(!twapRequired, "HyperpoolVault: TWAP_NO_SPOT");
            return;
        }

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = window;
        secondsAgos[1] = 0;

        try pool.observe(secondsAgos) returns (int56[] memory tickCumulatives, uint160[] memory) {
            int56 tickDelta = tickCumulatives[1] - tickCumulatives[0];
            int24 twapTick = int24(tickDelta / int56(int32(window)));
            uint160 twapSqrt = TickMath.getSqrtRatioAtTick(twapTick);

            uint256 spotP = FullMath.mulDiv(uint256(spotSqrt), uint256(spotSqrt), uint256(1) << 96);
            uint256 twapP = FullMath.mulDiv(uint256(twapSqrt), uint256(twapSqrt), uint256(1) << 96);
            if (twapP == 0) {
                require(!twapRequired, "HyperpoolVault: TWAP_ZERO");
                return;
            }

            uint256 diff = spotP > twapP ? spotP - twapP : twapP - spotP;
            require(
                diff * ProjectXConstants.BPS / twapP <= maxRebalanceDeviationBps,
                "HyperpoolVault: TWAP_DEVIATION"
            );
        } catch {
            require(!twapRequired, "HyperpoolVault: TWAP_UNAVAILABLE");
        }
    }

    /// @dev Bounds the keeper-supplied recentre price. Legacy USDC/HYPE vaults check it against the
    ///      HyperCore oracle. HYPE-quoted vaults have no such oracle, so they check it against the
    ///      live pool price — which `_enforceEntryPriceSane` has already TWAP-validated in the same
    ///      call. Without this, an oracle-less vault would accept ANY price from the keeper and
    ///      re-mint the whole position around it; a single decimal-scaling slip in the keeper
    ///      (the top risk of this generalization) would move the LP range orders of magnitude away
    ///      from the market and realise the loss immediately.
    function _enforceOracleDeviation(uint256 refPriceUsdc6PerHype18) internal view {
        if (address(oracle) == address(0)) {
            // No pool configured means no independent price reference exists at all (dedicated
            // mock-NPM path) — nothing to check against.
            if (address(adapter.pool()) == address(0)) return;
            uint256 spot = adapter.currentPoolPriceUsdc6PerHype18();
            if (spot == 0) return;
            uint256 spotDiff =
                refPriceUsdc6PerHype18 > spot ? refPriceUsdc6PerHype18 - spot : spot - refPriceUsdc6PerHype18;
            require(
                spotDiff * ProjectXConstants.BPS / spot <= maxRebalanceDeviationBps,
                "HyperpoolVault: POOL_PRICE_DEVIATION"
            );
            return;
        }

        uint256 oraclePrice = _oraclePriceUsdc6PerHype18();
        require(oraclePrice > 0, "HyperpoolVault: ORACLE_UNAVAILABLE");

        uint256 diff = refPriceUsdc6PerHype18 > oraclePrice
            ? refPriceUsdc6PerHype18 - oraclePrice
            : oraclePrice - refPriceUsdc6PerHype18;
        require(diff * ProjectXConstants.BPS / oraclePrice <= maxRebalanceDeviationBps, "HyperpoolVault: PRICE_DEVIATION");
    }

    /// @dev HyperCore oraclePx uses 4-decimal USD per 1 HYPE → humanPrice * 1e18 scale.
    function _oraclePriceUsdc6PerHype18() internal view returns (uint256) {
        if (address(oracle) == address(0)) return 0;
        (uint256 px, bool ok) = oracle.tryGetOraclePrice(hypeOracleAssetId);
        if (!ok || px == 0) return 0;
        return px * 1e14;
    }

    function _withdrawableUsdc() internal view returns (uint256) {
        uint256 bal = tokenUSDC.balanceOf(address(this));
        if (bal <= pendingUserRewards) return 0;
        return bal - pendingUserRewards;
    }

    function _mapAdapterAmounts(uint256 amount0, uint256 amount1) internal view returns (uint256 usdcAmt, uint256 hypeAmt) {
        if (address(adapter.token0()) == address(tokenUSDC)) {
            return (amount0, amount1);
        }
        return (amount1, amount0);
    }

    function _rangeDepositHypeUsdcBps() internal view returns (uint256 hypeBps, uint256 usdcBps) {
        (uint256 token0Bps, uint256 token1Bps) = adapter.rangeDepositRatioBps();
        if (address(adapter.token0()) == address(tokenWHYPE)) {
            return (token0Bps, token1Bps);
        }
        return (token1Bps, token0Bps);
    }

    /// @dev Quote token amount (10^quoteDec) from a base (10^baseDec) amount.
    ///      price is quote-per-base * 1e18, so the divisor is priceDiv = 10^(baseDec + 18 − quoteDec).
    ///      Reduces to /1e30 for USDC/WHYPE. Used for both NAV valuation and fee-swap min-out.
    function _hypeToUsdc(uint256 hypeAmount, uint256 priceUsdc6PerHype18) internal view returns (uint256) {
        if (hypeAmount == 0 || priceUsdc6PerHype18 == 0) return 0;
        return (hypeAmount * priceUsdc6PerHype18) / priceDiv;
    }

    /// @dev Alias kept for fee-swap call sites; identical scale to _hypeToUsdc.
    function _hypeFeeToUsdcTokens(uint256 hypeAmount, uint256 priceUsdc6PerHype18) internal view returns (uint256) {
        return _hypeToUsdc(hypeAmount, priceUsdc6PerHype18);
    }

    function _usdcToHype(uint256 usdcAmount, uint256 priceUsdc6PerHype18) internal view returns (uint256) {
        if (usdcAmount == 0 || priceUsdc6PerHype18 == 0) return 0;
        return (usdcAmount * priceDiv) / priceUsdc6PerHype18;
    }

    /// @dev Swap collected WHYPE fees to USDC via Project X router before 7/60/33 split
    function _swapHypeFeesToUsdc(uint256 hypeIn) internal returns (uint256 usdcOut) {
        uint256 price = adapter.refPriceUsdc6PerHype18();
        // refPrice is only refreshed on rebalance (every ~6h). If the base token has fallen since,
        // a minOut derived from the stale high price is unreachable and the swap reverts — which
        // _tryHarvestFees swallows, so fees silently stop being split and instead leak to the next
        // withdrawer. Take the lower of refPrice and the live pool price: it keeps the manipulation
        // ceiling that refPrice provides (a pumped spot cannot raise minOut's basis) while letting a
        // genuine price drop through.
        uint256 spot = adapter.currentPoolPriceUsdc6PerHype18();
        if (spot > 0 && (price == 0 || spot < price)) price = spot;
        if (price == 0) price = _oraclePriceUsdc6PerHype18();
        require(price > 0, "HyperpoolVault: NO_PRICE");

        uint256 expectedOut = _hypeFeeToUsdcTokens(hypeIn, price);
        uint256 minOut = (expectedOut * (ProjectXConstants.BPS - feeSwapSlippageBps)) / ProjectXConstants.BPS;

        usdcOut = _swapExact(address(tokenWHYPE), address(tokenUSDC), hypeIn, minOut);
    }

    /// @dev Mints `shares` (already priced on pre-deposit NAV by the caller). On the first
    ///      deposit, also locks minimumVaultShares to DEAD to harden against share-inflation.
    function _mintShares(uint256 shares, address receiver) internal {
        if (totalSupply() == 0) {
            _mint(DEAD, minimumVaultShares);
        }
        _mint(receiver, shares);
    }

    function _sortedAmounts(uint256 amountHype, uint256 amountUsdc) internal view returns (uint256 amount0, uint256 amount1) {
        if (address(tokenWHYPE) < address(tokenUSDC)) {
            return (amountHype, amountUsdc);
        }
        return (amountUsdc, amountHype);
    }

    function _deployToAdapter(uint256 amountHype, uint256 amountUsdc) internal {
        _deployBalancedToAdapter(amountHype, amountUsdc);
    }

    function _deployBalancedToAdapter(uint256 amountHype, uint256 amountUsdc) internal {
        _deployBalancedToAdapter(amountHype, amountUsdc, false);
    }

    /// @dev With `bestEffort`, a reverting adapter deposit is swallowed and the transferred
    ///      tokens are reclaimed via forwardIdleToVault, so an opportunistic re-deploy can
    ///      never roll back the primary deploy that preceded it.
    function _deployBalancedToAdapter(uint256 amountHype, uint256 amountUsdc, bool bestEffort) internal {
        (amountHype, amountUsdc) = _balanceSingleSidedDeposit(amountHype, amountUsdc);

        if (amountHype > 0) {
            tokenWHYPE.safeTransfer(address(adapter), amountHype);
        }
        if (amountUsdc > 0) {
            tokenUSDC.safeTransfer(address(adapter), amountUsdc);
        }
        (uint256 amount0, uint256 amount1) = _sortedAmounts(amountHype, amountUsdc);
        if (amount0 == 0 && amount1 == 0) return;
        if (bestEffort) {
            try adapter.deposit(amount0, amount1) returns (uint128) {} catch {}
        } else {
            adapter.deposit(amount0, amount1);
        }
        adapter.forwardIdleToVault();
    }

    /// @dev Re-attempt LP deploy for tokens returned as idle after the first mint (ratio mismatch).
    ///      Best-effort: the retry must never revert the primary deploy (mainnet 2026-07: a
    ///      3053-wei KHYPE leftover made the pool mint zero liquidity, reverting deployIdle
    ///      daily and stranding a growing share of TVL outside the LP position).
    function _redeployVaultIdleOnce() internal {
        uint256 hype = tokenWHYPE.balanceOf(address(this));
        uint256 usdc = _withdrawableUsdc();
        (hype, usdc) = _dropDustSide(hype, usdc);
        if (hype == 0 && usdc == 0) return;
        _deployBalancedToAdapter(hype, usdc, true);
    }

    /// @dev The NPM derives position liquidity from the smaller side of (amount0, amount1),
    ///      so a dust-sized side makes pool.mint revert on zero liquidity. Zero out any side
    ///      worth less than dustDepositQuote — the deposit then routes through the
    ///      single-sided balancer (or is skipped entirely when everything is dust). Dropped
    ///      dust stays idle in the vault and keeps backing NAV.
    function _dropDustSide(uint256 amountHype, uint256 amountUsdc)
        internal
        view
        returns (uint256, uint256)
    {
        uint256 price = adapter.currentPoolPriceUsdc6PerHype18();
        if (price == 0) price = adapter.refPriceUsdc6PerHype18();
        if (price == 0) price = _oraclePriceUsdc6PerHype18();
        if (price == 0) return (amountHype, amountUsdc);

        uint256 hypeAsUsdc = _hypeToUsdc(amountHype, price);
        if (hypeAsUsdc + amountUsdc < dustDepositQuote) return (0, 0);
        if (hypeAsUsdc < dustDepositQuote) return (0, amountUsdc);
        if (amountUsdc < dustDepositQuote) return (amountHype, 0);
        return (amountHype, amountUsdc);
    }

    function _balanceSingleSidedDeposit(uint256 amountHype, uint256 amountUsdc)
        internal
        returns (uint256 balancedHype, uint256 balancedUsdc)
    {
        balancedHype = amountHype;
        balancedUsdc = amountUsdc;
        if (swapRouter == address(0)) return (balancedHype, balancedUsdc);
        if ((amountHype == 0) == (amountUsdc == 0)) return (balancedHype, balancedUsdc);

        uint256 price = adapter.currentPoolPriceUsdc6PerHype18();
        if (price == 0) price = adapter.refPriceUsdc6PerHype18();
        if (price == 0) price = _oraclePriceUsdc6PerHype18();
        require(price > 0, "HyperpoolVault: NO_PRICE");

        if (amountUsdc > 0) {
            (uint256 hypeBps,) = _rangeDepositHypeUsdcBps();
            uint256 usdcIn = (amountUsdc * hypeBps) / ProjectXConstants.BPS;
            if (usdcIn == 0) return (balancedHype, balancedUsdc);
            uint256 expectedHype = _usdcToHype(usdcIn, price);
            uint256 minHype = (expectedHype * (ProjectXConstants.BPS - feeSwapSlippageBps)) / ProjectXConstants.BPS;
            uint256 hypeOut = _swapExact(address(tokenUSDC), address(tokenWHYPE), usdcIn, minHype);
            balancedUsdc = amountUsdc - usdcIn;
            balancedHype = hypeOut;
            emit SingleSidedDepositBalanced(address(tokenUSDC), address(tokenWHYPE), usdcIn, hypeOut);
            return (balancedHype, balancedUsdc);
        }

        (, uint256 usdcBps) = _rangeDepositHypeUsdcBps();
        uint256 hypeIn = (amountHype * usdcBps) / ProjectXConstants.BPS;
        if (hypeIn == 0) return (balancedHype, balancedUsdc);
        uint256 expectedUsdc = _hypeToUsdc(hypeIn, price);
        uint256 minUsdc = (expectedUsdc * (ProjectXConstants.BPS - feeSwapSlippageBps)) / ProjectXConstants.BPS;
        uint256 usdcOut = _swapExact(address(tokenWHYPE), address(tokenUSDC), hypeIn, minUsdc);
        balancedHype = amountHype - hypeIn;
        balancedUsdc = usdcOut;
        emit SingleSidedDepositBalanced(address(tokenWHYPE), address(tokenUSDC), hypeIn, usdcOut);
    }

    function _swapExact(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        internal
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).forceApprove(swapRouter, amountIn);
        amountOut = IProjectXSwapRouter(swapRouter).exactInputSingle(
            IProjectXSwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: adapter.fee(),
                recipient: address(this),
                deadline: block.timestamp + 1 hours,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
