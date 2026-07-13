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
import {HyperCoreConstants} from "../libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../libraries/ProjectXConstants.sol";

/// @title HyperpoolVault — ERC20 vault shares; deposits to Project X via adapter
contract HyperpoolVault is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant MINIMUM_VAULT_SHARES = 1000;
    /// @dev Sides worth less than 0.01 USDC are left idle instead of LP-deposited (see _dropDustSide).
    uint256 private constant DUST_DEPOSIT_USDC = 10_000;
    address private constant DEAD = address(0xdEaD);

    ProjectXAdapter public immutable adapter;
    HyperCoreOracle public immutable oracle;
    IERC20 public immutable tokenWHYPE;
    IERC20 public immutable tokenUSDC;
    address public immutable merkleAirdrop;

    uint32 public hypeOracleAssetId;
    uint256 public maxRebalanceDeviationBps = HyperCoreConstants.DEFAULT_REBALANCE_DEVIATION_BPS;

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
        oracle = HyperCoreOracle(_oracle);
        hypeOracleAssetId = _hypeOracleAssetId;
        tokenWHYPE = IERC20(_tokenWHYPE);
        tokenUSDC = IERC20(_tokenUSDC);
        merkleAirdrop = _merkleAirdrop;
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
            return amountUsdc > MINIMUM_VAULT_SHARES ? amountUsdc - MINIMUM_VAULT_SHARES : 0;
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

    /// @dev Reverts a deposit/rebalance when the pool spot price deviates from the oracle by more
    ///      than `maxRebalanceDeviationBps`. No-op when the oracle price is unavailable.
    function _enforceEntryPriceSane() internal view {
        uint256 oraclePrice = _entryOraclePrice();
        if (oraclePrice == 0) return;

        uint256 spot = adapter.currentPoolPriceUsdc6PerHype18();
        if (spot == 0) return;

        uint256 diff = spot > oraclePrice ? spot - oraclePrice : oraclePrice - spot;
        require(
            diff * ProjectXConstants.BPS / oraclePrice <= maxRebalanceDeviationBps,
            "HyperpoolVault: ENTRY_PRICE_DEVIATION"
        );
    }

    function _enforceOracleDeviation(uint256 refPriceUsdc6PerHype18) internal view {
        if (address(oracle) == address(0)) return;

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

    /// @dev USDC token amount (6 decimals) from a HYPE (1e18-wei) amount.
    ///      refPrice canonical scale = humanPrice*1e18 (= USDC6/HYPE * 1e12), so the divisor is
    ///      1e18 (wei) * 1e12 (price scale) = 1e30. Used for both NAV valuation and fee-swap min-out.
    function _hypeToUsdc(uint256 hypeAmount, uint256 priceUsdc6PerHype18) internal pure returns (uint256) {
        if (hypeAmount == 0 || priceUsdc6PerHype18 == 0) return 0;
        return (hypeAmount * priceUsdc6PerHype18) / 1e30;
    }

    /// @dev Alias kept for fee-swap call sites; identical scale to _hypeToUsdc.
    function _hypeFeeToUsdcTokens(uint256 hypeAmount, uint256 priceUsdc6PerHype18) internal pure returns (uint256) {
        return _hypeToUsdc(hypeAmount, priceUsdc6PerHype18);
    }

    function _usdcToHype(uint256 usdcAmount, uint256 priceUsdc6PerHype18) internal pure returns (uint256) {
        if (usdcAmount == 0 || priceUsdc6PerHype18 == 0) return 0;
        return (usdcAmount * 1e30) / priceUsdc6PerHype18;
    }

    /// @dev Swap collected WHYPE fees to USDC via Project X router before 7/60/33 split
    function _swapHypeFeesToUsdc(uint256 hypeIn) internal returns (uint256 usdcOut) {
        uint256 price = adapter.refPriceUsdc6PerHype18();
        if (price == 0) price = _oraclePriceUsdc6PerHype18();
        require(price > 0, "HyperpoolVault: NO_PRICE");

        uint256 expectedOut = _hypeFeeToUsdcTokens(hypeIn, price);
        uint256 minOut = (expectedOut * (ProjectXConstants.BPS - feeSwapSlippageBps)) / ProjectXConstants.BPS;

        usdcOut = _swapExact(address(tokenWHYPE), address(tokenUSDC), hypeIn, minOut);
    }

    /// @dev Mints `shares` (already priced on pre-deposit NAV by the caller). On the first
    ///      deposit, also locks MINIMUM_VAULT_SHARES to DEAD to harden against share-inflation.
    function _mintShares(uint256 shares, address receiver) internal {
        if (totalSupply() == 0) {
            _mint(DEAD, MINIMUM_VAULT_SHARES);
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
    ///      worth less than DUST_DEPOSIT_USDC — the deposit then routes through the
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
        if (hypeAsUsdc + amountUsdc < DUST_DEPOSIT_USDC) return (0, 0);
        if (hypeAsUsdc < DUST_DEPOSIT_USDC) return (0, amountUsdc);
        if (amountUsdc < DUST_DEPOSIT_USDC) return (amountHype, 0);
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
