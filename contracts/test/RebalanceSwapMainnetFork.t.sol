// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {IProjectXNPM} from "../src/interfaces/IProjectXNPM.sol";
import {IProjectXSwapRouter} from "../src/interfaces/IProjectXSwapRouter.sol";
import {IUniswapV3Pool} from "../src/interfaces/IUniswapV3Pool.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";
import {TickMath} from "../src/libraries/TickMath.sol";

/// @title RebalanceSwapMainnetFork — swap-to-ratio rebalance against the live Project X pools
/// @dev The mock NPM derives liquidity from a raw amount sum, so only a fork can prove that the
///      swap lands on the ratio the real pool math wants. Each test deploys a fresh pair exactly as
///      DeployHyperpoolPair does, seeds it, pushes the real pool price out of the ±5% range with a
///      large swap, lets the TWAP catch up, then rebalances.
///
///      Run: forge test --match-path 'test/RebalanceSwapMainnetFork.t.sol' -vv
contract RebalanceSwapMainnetFork is Test {
    address constant WHYPE = 0x5555555555555555555555555555555555555555;
    address constant UPUMP = 0x27eC642013bcB3D80CA3706599D3cdA04F6f4452;
    address constant UETH = 0xBe6727B535545C67d5cAa73dEa54865B92CF7907;
    address constant POOL_UPUMP = 0x78cc152A531DBde2F3Fe7001ad659fa120Fa893b;
    address constant POOL_UETH = 0xaf80230eB13222DB743C21762f65A046bb5F5437;
    uint32 constant TWAP_WINDOW = 900;

    address owner = address(this);
    address user = makeAddr("forkUser");
    address whale = makeAddr("priceMover");

    ProjectXAdapter adapter;
    HyperpoolVault vault;

    function setUp() public {
        vm.createSelectFork("https://rpc.hyperliquid.xyz/evm");
    }

    function _deployPair(address baseToken, address pool, bool withAdapterRouter) internal {
        address token0 = baseToken < WHYPE ? baseToken : WHYPE;
        address token1 = baseToken < WHYPE ? WHYPE : baseToken;

        MerkleAirdrop airdrop = new MerkleAirdrop(WHYPE);
        adapter = new ProjectXAdapter(
            ProjectXConstants.NPM_MAINNET, token0, token1, WHYPE, baseToken, ProjectXConstants.FEE_TIER_3000, 1e18, owner
        );
        vault = new HyperpoolVault(
            address(adapter), address(0), 0, baseToken, WHYPE, address(airdrop), owner, owner, owner, owner
        );
        adapter.setVault(address(vault));
        adapter.setPool(pool);
        adapter.setRangeBps(500, 500);
        airdrop.setVaultShareToken(address(vault));
        vault.setSwapRouter(ProjectXConstants.SWAP_ROUTER_MAINNET);
        if (withAdapterRouter) adapter.setSwapRouter(ProjectXConstants.SWAP_ROUTER_MAINNET);
        vault.setTwapWindow(TWAP_WINDOW);
    }

    function _seed(uint256 amountQuote) internal {
        deal(WHYPE, user, amountQuote);
        vm.startPrank(user);
        IERC20(WHYPE).approve(address(vault), type(uint256).max);
        vault.depositUSDC(amountQuote, user);
        vm.stopPrank();
    }

    /// @dev Swaps through the live router until the pool tick passes `targetTick`, then lets the
    ///      900s TWAP converge on the new spot so the vault's entry guard accepts a rebalance.
    function _movePoolTo(address pool, int24 targetTick) internal {
        IUniswapV3Pool p = IUniswapV3Pool(pool);
        (, int24 tick,,,,,) = p.slot0();
        bool up = targetTick > tick;
        address token0 = p.token0();
        address token1 = p.token1();
        // Raising the tick means buying token0 with token1.
        address tokenIn = up ? token1 : token0;
        address tokenOut = up ? token0 : token1;
        uint256 amountIn = tokenIn == WHYPE ? 1_000_000 ether : IERC20(tokenIn).balanceOf(pool) * 10;
        deal(tokenIn, whale, amountIn);

        vm.startPrank(whale);
        IERC20(tokenIn).approve(ProjectXConstants.SWAP_ROUTER_MAINNET, amountIn);
        IProjectXSwapRouter(ProjectXConstants.SWAP_ROUTER_MAINNET).exactInputSingle(
            IProjectXSwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: ProjectXConstants.FEE_TIER_3000,
                recipient: whale,
                deadline: block.timestamp + 1,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: TickMath.getSqrtRatioAtTick(targetTick)
            })
        );
        vm.stopPrank();

        vm.warp(block.timestamp + TWAP_WINDOW + 60);
        vm.roll(block.number + 100);
    }

    function _positionAmounts() internal view returns (uint256 amtQuote, uint256 amtBase, uint128 liq) {
        (,,,,,,, liq,,,,) = IProjectXNPM(ProjectXConstants.NPM_MAINNET).positions(adapter.positionTokenId());
        (uint256 a0, uint256 a1) = adapter.positionTokenAmounts();
        bool quoteIs0 = address(adapter.token0()) == WHYPE;
        (amtQuote, amtBase) = quoteIs0 ? (a0, a1) : (a1, a0);
    }

    function _assertRecentred(address pool, uint256 navBefore, string memory label) internal view {
        (, int24 tick,,,,,) = IUniswapV3Pool(pool).slot0();
        int24 lower = adapter.tickLower();
        int24 upper = adapter.tickUpper();
        (uint256 amtQuote, uint256 amtBase, uint128 liq) = _positionAmounts();
        uint256 navAfter = vault.totalAssetsUsdc();
        uint256 idleQuote = IERC20(WHYPE).balanceOf(address(vault));
        uint256 idleBase = IERC20(address(adapter.baseToken())).balanceOf(address(vault));
        uint256 price = adapter.currentPoolPriceQuotePerBase18();
        uint256 idleVal = idleQuote + (idleBase * price) / adapter.priceDiv();

        console2.log("===", label);
        console2.log("  tick / lower / upper");
        console2.logInt(tick);
        console2.logInt(lower);
        console2.logInt(upper);
        console2.log("  position quote", amtQuote);
        console2.log("  position base", amtBase);
        console2.log("  NAV before", navBefore);
        console2.log("  NAV after", navAfter);
        console2.log("  idle value (quote)", idleVal);

        assertTrue(tick >= lower && tick < upper, "live tick must be inside the new range");
        assertGt(liq, 0, "re-minted position has no liquidity");
        assertGt(amtQuote, 0, "position holds no quote");
        assertGt(amtBase, 0, "position holds no base");
        // One 0.3% swap on roughly half the book plus impact: NAV should stay within 1%.
        assertApproxEqRel(navAfter, navBefore, 1e16, "rebalance lost more than 1% of NAV");
        // The swap should leave little behind; anything idle is still NAV, just not earning.
        assertLt(idleVal * 100, navAfter * 3, "more than 3% of NAV left idle after re-mint");
    }

    // -----------------------------------------------------------------------

    function test_UpumpPriceAboveRange_SwapRecentres() public {
        _deployPair(UPUMP, POOL_UPUMP, true);
        _seed(5 ether);
        uint256 navBefore = vault.totalAssetsUsdc();

        _movePoolTo(POOL_UPUMP, adapter.tickUpper() + 600);
        (uint256 q, uint256 b,) = _positionAmounts();
        assertEq(b, 0, "precondition: position should be all quote above range");
        assertGt(q, 0);
        navBefore = vault.totalAssetsUsdc();

        vault.rebalance(adapter.currentPoolPriceQuotePerBase18());
        _assertRecentred(POOL_UPUMP, navBefore, "UPUMP above range");
    }

    function test_UpumpPriceBelowRange_SwapRecentres() public {
        _deployPair(UPUMP, POOL_UPUMP, true);
        _seed(5 ether);

        _movePoolTo(POOL_UPUMP, adapter.tickLower() - 600);
        (uint256 q, uint256 b,) = _positionAmounts();
        assertEq(q, 0, "precondition: position should be all base below range");
        assertGt(b, 0);
        uint256 navBefore = vault.totalAssetsUsdc();

        vault.rebalance(adapter.currentPoolPriceQuotePerBase18());
        _assertRecentred(POOL_UPUMP, navBefore, "UPUMP below range");
    }

    function test_UethPriceAboveRange_SwapRecentres() public {
        _deployPair(UETH, POOL_UETH, true);
        _seed(5 ether);

        _movePoolTo(POOL_UETH, adapter.tickUpper() + 600);
        uint256 navBefore = vault.totalAssetsUsdc();

        vault.rebalance(adapter.currentPoolPriceQuotePerBase18());
        _assertRecentred(POOL_UETH, navBefore, "UETH above range");
    }

    /// Same scenario with the adapter router unset reproduces the production failure.
    function test_UpumpWithoutAdapterRouter_RebalanceReverts() public {
        _deployPair(UPUMP, POOL_UPUMP, false);
        _seed(5 ether);
        _movePoolTo(POOL_UPUMP, adapter.tickUpper() + 600);

        uint256 spot = adapter.currentPoolPriceQuotePerBase18();
        vm.expectRevert();
        vault.rebalance(spot);
    }

    /// In-range rebalance with the swap enabled must still behave: NAV kept, range re-centred.
    function test_UpumpInRangeRebalanceStillWorks() public {
        _deployPair(UPUMP, POOL_UPUMP, true);
        _seed(5 ether);
        uint256 navBefore = vault.totalAssetsUsdc();

        vault.rebalance(adapter.currentPoolPriceQuotePerBase18());
        _assertRecentred(POOL_UPUMP, navBefore, "UPUMP in range");

        // Withdraw everything: the user gets their value back after the swap-rebalance.
        uint256 shares = vault.balanceOf(user);
        vm.prank(user);
        (uint256 outQuote, uint256 outBase) = vault.withdraw(shares, user);
        uint256 baseAsQuote = (outBase * adapter.currentPoolPriceQuotePerBase18()) / adapter.priceDiv();
        assertApproxEqRel(outQuote + baseAsQuote, 5 ether, 3e16, "round trip lost more than 3%");
    }
}
