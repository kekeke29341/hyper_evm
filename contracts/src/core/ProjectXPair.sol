// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolMath} from "../libraries/PoolMath.sol";

interface IPointsDistributor {
    function recordFeeContribution(address pool, address user, uint256 feeAmount) external;
}

interface IProjectXFactory {
    function trustedRouter() external view returns (address);
}

/// @title ProjectXPair — constant-product AMM with V3-inspired fee routing (86% to LPs)
/// @dev Spot reserves are a read-only oracle during swap callbacks — do not use getReserves() mid-callback.
contract ProjectXPair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant SWAP_FEE_BPS = 30; // 0.30%
    uint256 public constant LP_FEE_SHARE_BPS = 8600; // 86% of fees to LPs (accrue in reserves)
    uint256 public constant PROTOCOL_FEE_SHARE_BPS = 1400; // 14% to protocol

    address public factory;
    address public token0;
    address public token1;
    address public feeCollector;
    IPointsDistributor public pointsDistributor;

    uint256 public reserve0;
    uint256 public reserve1;
    uint256 private unlocked = 1;
    address private constant DEAD = address(0xdEaD);

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint256 reserve0, uint256 reserve1);

    modifier lock() {
        require(unlocked == 1, "ProjectXPair: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() ERC20("ProjectX LP", "PRJX-LP") {
        factory = msg.sender;
    }

    function initialize(
        address _token0,
        address _token1,
        address _feeCollector,
        address _pointsDistributor
    ) external {
        require(msg.sender == factory, "ProjectXPair: FORBIDDEN");
        require(token0 == address(0), "ProjectXPair: INITIALIZED");
        token0 = _token0;
        token1 = _token1;
        feeCollector = _feeCollector;
        pointsDistributor = IPointsDistributor(_pointsDistributor);
    }

    /// @notice Propagate factory config updates to this pair (factory-only)
    function setConfig(address _feeCollector, address _pointsDistributor) external {
        require(msg.sender == factory, "ProjectXPair: FORBIDDEN");
        feeCollector = _feeCollector;
        pointsDistributor = IPointsDistributor(_pointsDistributor);
    }

    /// @notice Last synced reserves. During `swap` callbacks (before `_update`), values are stale —
    ///         do not use as a spot price oracle. TWAP is not implemented.
    function getReserves() public view returns (uint256 _reserve0, uint256 _reserve1) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = balance0;
        reserve1 = balance1;
        emit Sync(reserve0, reserve1);
    }

    function mint(address to) external nonReentrant lock returns (uint256 liquidity) {
        (uint256 _reserve0, uint256 _reserve1) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply();

        if (_totalSupply == 0) {
            liquidity = PoolMath.sqrt(amount0 * amount1) - PoolMath.MINIMUM_LIQUIDITY;
            _mint(DEAD, PoolMath.MINIMUM_LIQUIDITY);
        } else {
            liquidity = _min((amount0 * _totalSupply) / _reserve0, (amount1 * _totalSupply) / _reserve1);
        }
        require(liquidity > 0, "ProjectXPair: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external nonReentrant lock returns (uint256 amount0, uint256 amount1) {
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));
        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "ProjectXPair: INSUFFICIENT_LIQUIDITY_BURNED");
        _burn(address(this), liquidity);
        IERC20(_token0).safeTransfer(to, amount0);
        IERC20(_token1).safeTransfer(to, amount1);
        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));
        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, address origin, bytes calldata data)
        external
        nonReentrant
        lock
    {
        require(amount0Out > 0 || amount1Out > 0, "ProjectXPair: INSUFFICIENT_OUTPUT");
        (uint256 _reserve0, uint256 _reserve1) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "ProjectXPair: INSUFFICIENT_LIQUIDITY");

        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);
        if (data.length > 0) {
            (bool ok,) = to.call(data);
            require(ok, "ProjectXPair: CALLBACK_FAILED");
        }
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "ProjectXPair: INSUFFICIENT_INPUT");
        require(amount0In == 0 || amount1In == 0, "ProjectXPair: TWO_SIDED_INPUT");

        uint256 balance0Adjusted = balance0 * 10_000 - amount0In * SWAP_FEE_BPS;
        uint256 balance1Adjusted = balance1 * 10_000 - amount1In * SWAP_FEE_BPS;
        require(
            Math.mulDiv(balance0Adjusted, balance1Adjusted, 10_000 ** 2) >= uint256(_reserve0) * uint256(_reserve1),
            "ProjectXPair: K"
        );

        address trustedRouter = IProjectXFactory(factory).trustedRouter();
        bool recordPoints = msg.sender == trustedRouter && trustedRouter != address(0);

        uint256 totalFee;
        if (amount0In > 0) {
            totalFee = (amount0In * SWAP_FEE_BPS) / 10_000;
            uint256 protocolShare = (totalFee * PROTOCOL_FEE_SHARE_BPS) / 10_000;
            if (protocolShare > 0 && feeCollector != address(0)) {
                IERC20(token0).safeTransfer(feeCollector, protocolShare);
            }
            if (recordPoints && address(pointsDistributor) != address(0)) {
                pointsDistributor.recordFeeContribution(address(this), origin, totalFee);
            }
        }
        if (amount1In > 0) {
            totalFee = (amount1In * SWAP_FEE_BPS) / 10_000;
            uint256 protocolShare = (totalFee * PROTOCOL_FEE_SHARE_BPS) / 10_000;
            if (protocolShare > 0 && feeCollector != address(0)) {
                IERC20(token1).safeTransfer(feeCollector, protocolShare);
            }
            if (recordPoints && address(pointsDistributor) != address(0)) {
                pointsDistributor.recordFeeContribution(address(this), origin, totalFee);
            }
        }

        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));
        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
