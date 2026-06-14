// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ProjectXRouter} from "./ProjectXRouter.sol";

/// @title HyperpoolLiquidityVault
/// @notice Phase 3 V2 vault for kHYPE/USDC LP shares with single-token Zap support.
contract HyperpoolLiquidityVault is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant MINIMUM_VAULT_SHARES = 1000;
    address private constant DEAD = address(0xdEaD);

    ProjectXRouter public immutable router;
    IERC20 public immutable pair;
    IERC20 public immutable tokenKHYPE;
    IERC20 public immutable tokenUSDC;

    address public keeper;
    uint256 public targetRangeBps = 600; // display/strategy band, not concentrated liquidity.

    event DepositDual(
        address indexed caller,
        address indexed receiver,
        uint256 amountKHYPE,
        uint256 amountUSDC,
        uint256 liquidity,
        uint256 shares
    );
    event DepositSingle(
        address indexed caller,
        address indexed receiver,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 swapAmount,
        uint256 liquidity,
        uint256 shares
    );
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        uint256 shares,
        uint256 liquidity,
        uint256 amountKHYPE,
        uint256 amountUSDC
    );
    event Rebalanced(address indexed keeper, uint256 amountKHYPE, uint256 amountUSDC, uint256 liquidity);
    event KeeperUpdated(address indexed keeper);
    event TargetRangeUpdated(uint256 rangeBps);

    modifier onlyKeeperOrOwner() {
        require(msg.sender == keeper || msg.sender == owner(), "HyperpoolVault: NOT_KEEPER");
        _;
    }

    constructor(
        address _router,
        address _pair,
        address _tokenKHYPE,
        address _tokenUSDC,
        address _owner,
        address _keeper
    ) ERC20("Hyperpool kHYPE-USDC Vault", "hp-kHYPE-USDC") Ownable(_owner) {
        require(
            _router != address(0) && _pair != address(0) && _tokenKHYPE != address(0) && _tokenUSDC != address(0),
            "HyperpoolVault: ZERO_ADDRESS"
        );
        router = ProjectXRouter(_router);
        pair = IERC20(_pair);
        tokenKHYPE = IERC20(_tokenKHYPE);
        tokenUSDC = IERC20(_tokenUSDC);
        keeper = _keeper == address(0) ? _owner : _keeper;
        emit KeeperUpdated(keeper);
    }

    function totalManagedLp() public view returns (uint256) {
        return pair.balanceOf(address(this));
    }

    function previewSharesForLiquidity(uint256 liquidity) public view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 managed = totalManagedLp();
        if (supply == 0 || managed == 0) {
            return liquidity > MINIMUM_VAULT_SHARES ? liquidity - MINIMUM_VAULT_SHARES : 0;
        }
        return (liquidity * supply) / managed;
    }

    function depositDual(
        uint256 amountKHYPEDesired,
        uint256 amountUSDCDesired,
        uint256 amountKHYPEMin,
        uint256 amountUSDCMin,
        address receiver,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 amountKHYPE, uint256 amountUSDC, uint256 liquidity, uint256 shares) {
        require(receiver != address(0), "HyperpoolVault: ZERO_RECEIVER");
        require(amountKHYPEDesired > 0 && amountUSDCDesired > 0, "HyperpoolVault: ZERO_AMOUNT");

        uint256 beforeKHYPE = tokenKHYPE.balanceOf(address(this));
        uint256 beforeUSDC = tokenUSDC.balanceOf(address(this));
        uint256 lpBefore = totalManagedLp();

        tokenKHYPE.safeTransferFrom(msg.sender, address(this), amountKHYPEDesired);
        tokenUSDC.safeTransferFrom(msg.sender, address(this), amountUSDCDesired);

        _approveExact(tokenKHYPE, address(router), amountKHYPEDesired);
        _approveExact(tokenUSDC, address(router), amountUSDCDesired);
        (amountKHYPE, amountUSDC, liquidity) = router.addLiquidity(
            address(tokenKHYPE),
            address(tokenUSDC),
            amountKHYPEDesired,
            amountUSDCDesired,
            amountKHYPEMin,
            amountUSDCMin,
            address(this),
            deadline
        );

        shares = _mintSharesFromLp(lpBefore, receiver);
        _refundSurplus(beforeKHYPE, beforeUSDC, msg.sender);
        emit DepositDual(msg.sender, receiver, amountKHYPE, amountUSDC, liquidity, shares);
    }

    function depositSingle(
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 amountKHYPEMin,
        uint256 amountUSDCMin,
        address receiver,
        uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 liquidity, uint256 shares) {
        require(receiver != address(0), "HyperpoolVault: ZERO_RECEIVER");
        require(tokenIn == address(tokenKHYPE) || tokenIn == address(tokenUSDC), "HyperpoolVault: INVALID_TOKEN");
        require(amountIn > 1, "HyperpoolVault: ZERO_AMOUNT");

        IERC20 input = IERC20(tokenIn);
        uint256 beforeKHYPE = tokenKHYPE.balanceOf(address(this));
        uint256 beforeUSDC = tokenUSDC.balanceOf(address(this));
        uint256 lpBefore = totalManagedLp();
        uint256 swapAmount = amountIn / 2;

        input.safeTransferFrom(msg.sender, address(this), amountIn);
        _swapHalf(tokenIn, swapAmount, amountOutMin, deadline);

        uint256 khypeAvailable = tokenKHYPE.balanceOf(address(this)) - beforeKHYPE;
        uint256 usdcAvailable = tokenUSDC.balanceOf(address(this)) - beforeUSDC;
        require(khypeAvailable > 0 && usdcAvailable > 0, "HyperpoolVault: INSUFFICIENT_ZAP");

        _approveExact(tokenKHYPE, address(router), khypeAvailable);
        _approveExact(tokenUSDC, address(router), usdcAvailable);
        (,, liquidity) = router.addLiquidity(
            address(tokenKHYPE),
            address(tokenUSDC),
            khypeAvailable,
            usdcAvailable,
            amountKHYPEMin,
            amountUSDCMin,
            address(this),
            deadline
        );

        shares = _mintSharesFromLp(lpBefore, receiver);
        _refundSurplus(beforeKHYPE, beforeUSDC, msg.sender);
        emit DepositSingle(msg.sender, receiver, tokenIn, amountIn, swapAmount, liquidity, shares);
    }

    function withdraw(uint256 shares, uint256 amountKHYPEMin, uint256 amountUSDCMin, address receiver, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountKHYPE, uint256 amountUSDC, uint256 liquidity)
    {
        require(receiver != address(0), "HyperpoolVault: ZERO_RECEIVER");
        require(shares > 0, "HyperpoolVault: ZERO_SHARES");

        uint256 supply = totalSupply();
        liquidity = (totalManagedLp() * shares) / supply;
        require(liquidity > 0, "HyperpoolVault: INSUFFICIENT_LP");

        _burn(msg.sender, shares);
        _approveExact(pair, address(router), liquidity);
        (amountKHYPE, amountUSDC) = router.removeLiquidity(
            address(tokenKHYPE),
            address(tokenUSDC),
            liquidity,
            amountKHYPEMin,
            amountUSDCMin,
            receiver,
            deadline
        );
        emit Withdraw(msg.sender, receiver, shares, liquidity, amountKHYPE, amountUSDC);
    }

    function rebalance(uint256 amountKHYPEMin, uint256 amountUSDCMin, uint256 deadline)
        external
        nonReentrant
        whenNotPaused
        onlyKeeperOrOwner
        returns (uint256 amountKHYPE, uint256 amountUSDC, uint256 liquidity)
    {
        uint256 khypeAvailable = tokenKHYPE.balanceOf(address(this));
        uint256 usdcAvailable = tokenUSDC.balanceOf(address(this));
        require(khypeAvailable > 0 && usdcAvailable > 0, "HyperpoolVault: NO_IDLE_BALANCE");

        _approveExact(tokenKHYPE, address(router), khypeAvailable);
        _approveExact(tokenUSDC, address(router), usdcAvailable);
        (amountKHYPE, amountUSDC, liquidity) = router.addLiquidity(
            address(tokenKHYPE),
            address(tokenUSDC),
            khypeAvailable,
            usdcAvailable,
            amountKHYPEMin,
            amountUSDCMin,
            address(this),
            deadline
        );
        emit Rebalanced(msg.sender, amountKHYPE, amountUSDC, liquidity);
    }

    function setKeeper(address _keeper) external onlyOwner {
        require(_keeper != address(0), "HyperpoolVault: ZERO_ADDRESS");
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setTargetRangeBps(uint256 _targetRangeBps) external onlyOwner {
        require(_targetRangeBps > 0 && _targetRangeBps <= 10_000, "HyperpoolVault: INVALID_RANGE");
        targetRangeBps = _targetRangeBps;
        emit TargetRangeUpdated(_targetRangeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _swapHalf(address tokenIn, uint256 swapAmount, uint256 amountOutMin, uint256 deadline) private {
        _approveExact(IERC20(tokenIn), address(router), swapAmount);
        address[] memory path = new address[](2);
        if (tokenIn == address(tokenKHYPE)) {
            path[0] = address(tokenKHYPE);
            path[1] = address(tokenUSDC);
        } else {
            path[0] = address(tokenUSDC);
            path[1] = address(tokenKHYPE);
        }
        router.swapExactTokensForTokens(swapAmount, amountOutMin, path, address(this), deadline);
    }

    function _mintSharesFromLp(uint256 lpBefore, address receiver) private returns (uint256 shares) {
        uint256 lpAfter = totalManagedLp();
        uint256 lpGained = lpAfter - lpBefore;
        require(lpGained > 0, "HyperpoolVault: NO_LP_GAINED");

        uint256 supply = totalSupply();
        if (supply == 0 || lpBefore == 0) {
            require(lpGained > MINIMUM_VAULT_SHARES, "HyperpoolVault: INSUFFICIENT_LP");
            _mint(DEAD, MINIMUM_VAULT_SHARES);
            shares = lpGained - MINIMUM_VAULT_SHARES;
        } else {
            shares = (lpGained * supply) / lpBefore;
        }
        require(shares > 0, "HyperpoolVault: ZERO_SHARES");
        _mint(receiver, shares);
    }

    function _refundSurplus(uint256 beforeKHYPE, uint256 beforeUSDC, address receiver) private {
        uint256 khypeSurplus = tokenKHYPE.balanceOf(address(this)) - beforeKHYPE;
        uint256 usdcSurplus = tokenUSDC.balanceOf(address(this)) - beforeUSDC;
        if (khypeSurplus > 0) tokenKHYPE.safeTransfer(receiver, khypeSurplus);
        if (usdcSurplus > 0) tokenUSDC.safeTransfer(receiver, usdcSurplus);
    }

    function _approveExact(IERC20 token, address spender, uint256 amount) private {
        token.forceApprove(spender, 0);
        token.forceApprove(spender, amount);
    }
}
