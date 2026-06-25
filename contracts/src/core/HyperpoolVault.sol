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
    address public swapRouter;
    uint256 public operatorFeeBps = ProjectXConstants.OPERATOR_FEE_BPS;
    uint256 public feeSwapSlippageBps = 50;
    bool public convertHypeFeesToUsdc = true;

    /// @notice USDC reserved for user Merkle distribution (67% of collected USDC fees)
    uint256 public pendingUserRewards;

    event Deposit(address indexed caller, address indexed receiver, uint256 amountUSDC, uint256 shares);
    event DepositHype(address indexed caller, address indexed receiver, uint256 amountHype, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, uint256 shares, uint256 amountUSDC, uint256 amountHype);
    event FeesHarvested(
        uint256 usdcFees,
        uint256 hypeFees,
        uint256 usdcFromHypeSwap,
        uint256 operatorUsdc,
        uint256 operatorHype,
        uint256 userUsdc
    );
    event SwapRouterUpdated(address indexed router);
    event ConvertHypeFeesToUsdcUpdated(bool enabled);
    event FeeSwapSlippageBpsUpdated(uint256 bps);
    event KeeperUpdated(address indexed keeper);
    event OperatorWalletUpdated(address indexed wallet);
    event RebalanceDeviationBpsUpdated(uint256 bps);
    event ForeignTokenRecovered(address indexed token, address indexed to, uint256 amount);

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
        address _operatorWallet
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
        emit KeeperUpdated(keeper);
        emit OperatorWalletUpdated(operatorWallet);
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
    function totalAssetsUsdc() public view returns (uint256) {
        uint256 price = adapter.refPriceUsdc6PerHype18();
        if (price == 0) price = 42e6 * 1e12;

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

        uint256 price = adapter.refPriceUsdc6PerHype18();
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

    /// @notice Keeper/owner: collect Project X fees; optional HYPE→USDC swap; split 33% operator / 67% Merkle (all USDC when swap enabled)
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
        userUsdc = usdcFees - operatorUsdc;

        if (operatorUsdc > 0) {
            tokenUSDC.safeTransfer(operatorWallet, operatorUsdc);
        }

        uint256 operatorHype = (hypeFees * operatorFeeBps) / ProjectXConstants.BPS;
        if (operatorHype > 0) {
            tokenWHYPE.safeTransfer(operatorWallet, operatorHype);
        }

        pendingUserRewards += userUsdc;
        emit FeesHarvested(usdcFees, hypeFees, usdcFromHypeSwap, operatorUsdc, operatorHype, userUsdc);
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

    /// @notice Keeper recenter; ref price must be within maxRebalanceDeviationBps of HyperCore oracle when available
    function rebalance(uint256 refPriceUsdc6PerHype18) external onlyKeeperOrOwner {
        require(refPriceUsdc6PerHype18 > 0, "HyperpoolVault: ZERO_PRICE");
        _enforceOracleDeviation(refPriceUsdc6PerHype18);
        adapter.rebalance(refPriceUsdc6PerHype18);
    }

    /// @notice HyperCore oracle price as USDC(6) per 1 HYPE (1e18 wei); 0 if unavailable
    function oraclePriceUsdc6PerHype18() public view returns (uint256) {
        return _oraclePriceUsdc6PerHype18();
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

    /// @dev HyperCore oraclePx uses 8-decimal USD per 1 HYPE → usdc6PerHype18 scale
    function _oraclePriceUsdc6PerHype18() internal view returns (uint256) {
        if (address(oracle) == address(0)) return 0;
        (uint256 px, bool ok) = oracle.tryGetOraclePrice(hypeOracleAssetId);
        if (!ok || px == 0) return 0;
        return px * 1e10;
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

    /// @dev Swap collected WHYPE fees to USDC via Project X router before 33/67 split
    function _swapHypeFeesToUsdc(uint256 hypeIn) internal returns (uint256 usdcOut) {
        uint256 price = adapter.refPriceUsdc6PerHype18();
        if (price == 0) price = _oraclePriceUsdc6PerHype18();
        if (price == 0) price = 42e6 * 1e12;

        uint256 expectedOut = _hypeFeeToUsdcTokens(hypeIn, price);
        uint256 minOut = (expectedOut * (ProjectXConstants.BPS - feeSwapSlippageBps)) / ProjectXConstants.BPS;

        tokenWHYPE.forceApprove(swapRouter, hypeIn);
        usdcOut = IProjectXSwapRouter(swapRouter).exactInputSingle(
            IProjectXSwapRouter.ExactInputSingleParams({
                tokenIn: address(tokenWHYPE),
                tokenOut: address(tokenUSDC),
                fee: adapter.fee(),
                recipient: address(this),
                deadline: block.timestamp + 1 hours,
                amountIn: hypeIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
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
        if (amountHype > 0) {
            tokenWHYPE.safeTransfer(address(adapter), amountHype);
        }
        if (amountUsdc > 0) {
            tokenUSDC.safeTransfer(address(adapter), amountUsdc);
        }
        (uint256 amount0, uint256 amount1) = _sortedAmounts(amountHype, amountUsdc);
        adapter.deposit(amount0, amount1);
    }
}
