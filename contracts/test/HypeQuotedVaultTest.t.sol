// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockProjectXNPM} from "../src/mocks/MockProjectXNPM.sol";
import {MockUniswapV3Pool} from "../src/mocks/MockUniswapV3Pool.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {TickMath} from "../src/libraries/TickMath.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";
import {ProjectXPrice} from "../src/libraries/ProjectXPrice.sol";

/// @title HypeQuotedVaultTest — numeraire-agnostic vault/adapter for HYPE-quoted pairs
/// @dev Covers quote = WHYPE (18 dec) against base ∈ {6, 8, 18} (UPUMP/UBTC/UETH shapes), plus a
///      regression assertion that the generalized path reduces to priceDiv == 1e30 for USDC/WHYPE.
///      The vault's legacy field names are role-flipped for these pools:
///        tokenUSDC  == quote (WHYPE), depositUSDC() deposits the quote token
///        tokenWHYPE == base  (UPUMP/UBTC/UETH), depositHYPE() deposits the base token
contract HypeQuotedVaultTest is Test {
    MockERC20 quote; // WHYPE, 18 dec
    MockERC20 base; // UPUMP(6)/UBTC(8)/UETH(18)
    MockProjectXNPM npm;
    MockUniswapV3Pool pool;
    MockSwapRouter router;
    ProjectXAdapter adapter;
    HyperpoolVault vault;

    address user = makeAddr("user");

    /// @dev Deploy a HYPE-quoted pair: quote = WHYPE(18), base = MockERC20(baseDec).
    ///      refPrice is quote-per-base * 1e18 (humanPrice of the base in HYPE, scaled by 1e18).
    function _setupPair(uint8 baseDec, uint256 refPriceQuotePerBase18) internal {
        quote = new MockERC20("Wrapped HYPE", "WHYPE", 18);
        base = new MockERC20("Base", "BASE", baseDec);
        npm = new MockProjectXNPM();

        address token0 = address(base) < address(quote) ? address(base) : address(quote);
        address token1 = address(base) < address(quote) ? address(quote) : address(base);

        adapter = new ProjectXAdapter(
            address(npm),
            token0,
            token1,
            address(quote), // _quoteToken (numeraire)
            address(base), // _baseToken (priced asset)
            ProjectXConstants.FEE_TIER_DEFAULT,
            refPriceQuotePerBase18,
            address(this)
        );

        // Oracle unset (address(0)) -> the HyperCore oracle branch of the entry guard no-ops; these
        // vaults rely on the pool TWAP guard instead. base plays the legacy `tokenWHYPE` role.
        vault = new HyperpoolVault(
            address(adapter),
            address(0),
            0,
            address(base),
            address(quote),
            makeAddr("airdrop"),
            address(this),
            address(this),
            address(this),
            address(this)
        );
        adapter.setVault(address(vault));
        adapter.setRangeBps(500, 500); // +/-5%

        bool quoteIsToken0 = token0 == address(quote);
        uint160 sqrtP = ProjectXPrice.sqrtPriceX96FromRefPrice(refPriceQuotePerBase18, quoteIsToken0, adapter.priceDiv());
        pool = new MockUniswapV3Pool(sqrtP, TickMath.getTickAtSqrtRatio(sqrtP));
        adapter.setPool(address(pool));

        router = new MockSwapRouter(refPriceQuotePerBase18);
        router.setQuoteToken(address(quote));
        vault.setSwapRouter(address(router));
        // Fund both sides so the single-sided deposit balancer and fee swaps can execute.
        quote.mint(address(router), 1_000_000 ether);
        base.mint(address(router), 1_000_000 * (10 ** uint256(baseDec)));
    }

    // --- priceDiv / decimal derivation -------------------------------------------------

    function test_PriceDivReducesToDecimalPower() public {
        _setupPair(6, 1e15); // 1 base = 0.001 HYPE
        assertEq(adapter.priceDiv(), 1e6, "base 6 -> priceDiv 1e6");
        assertEq(vault.priceDiv(), 1e6, "vault mirrors adapter priceDiv");
        assertEq(vault.dustDepositQuote(), 1e16, "0.01 WHYPE dust floor");
        assertEq(adapter.baseDecimals(), 6);
        assertEq(adapter.quoteDecimals(), 18);

        _setupPair(8, 1e18);
        assertEq(adapter.priceDiv(), 1e8, "base 8 -> priceDiv 1e8");

        _setupPair(18, 3e18);
        assertEq(adapter.priceDiv(), 1e18, "base 18 -> priceDiv 1e18");
    }

    /// Regression: the same generalized constructor path yields the historical 1e30 for USDC/WHYPE.
    function test_RegressionUsdcWhypePriceDivIs1e30() public {
        MockERC20 whype = new MockERC20("HYPE", "HYPE", 18);
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockProjectXNPM n = new MockProjectXNPM();
        address t0 = address(whype) < address(usdc) ? address(whype) : address(usdc);
        address t1 = address(whype) < address(usdc) ? address(usdc) : address(whype);
        ProjectXAdapter a = new ProjectXAdapter(
            address(n), t0, t1, address(usdc), address(whype), ProjectXConstants.FEE_TIER_DEFAULT, 42e6 * 1e12, address(this)
        );
        assertEq(a.priceDiv(), 1e30, "USDC(6)/WHYPE(18) priceDiv must stay 1e30");
    }

    // --- pool price round-trip ----------------------------------------------------------

    function test_CurrentPoolPriceMatchesRefAcrossDecimals() public {
        _assertPoolPrice(6, 1e15);
        _assertPoolPrice(8, 65_000e18); // 1 UBTC ≈ 65k HYPE
        _assertPoolPrice(18, 3e18); // 1 UETH ≈ 3 HYPE
    }

    function _assertPoolPrice(uint8 baseDec, uint256 refPrice) internal {
        _setupPair(baseDec, refPrice);
        // sqrtPrice rounding tolerance: 0.01%.
        assertApproxEqRel(adapter.currentPoolPriceQuotePerBase18(), refPrice, 1e14, "pool price != ref");
        assertApproxEqRel(adapter.currentPoolPriceUsdc6PerHype18(), refPrice, 1e14, "legacy alias diverges");
    }

    // --- +/-5% tick range -----------------------------------------------------------------

    function test_MintUsesFivePercentRange() public {
        _setupPair(8, 65_000e18);

        // Seed a deposit so the adapter mints its first position and records tickLower/tickUpper.
        _depositQuote(user, 100 ether);

        bool quoteIsToken0 = address(adapter.token0()) == address(quote);
        (int24 expLower, int24 expUpper) =
            ProjectXPrice.ticksFromRefPrice(adapter.refPriceUsdc6PerHype18(), quoteIsToken0, adapter.priceDiv(), 500, 500);

        assertEq(adapter.tickLower(), expLower, "lower tick != +/-5% expectation");
        assertEq(adapter.tickUpper(), expUpper, "upper tick != +/-5% expectation");
        assertEq(adapter.tickLower() % 60, 0, "lower not spacing-aligned");
        assertEq(adapter.tickUpper() % 60, 0, "upper not spacing-aligned");
        assertLt(adapter.tickLower(), adapter.tickUpper());
    }

    // --- deposit / NAV / withdraw -------------------------------------------------------

    function test_DepositMintsSharesAndBacksNav() public {
        _assertDepositNav(6, 1e15);
        _assertDepositNav(8, 65_000e18);
        _assertDepositNav(18, 3e18);
    }

    function _assertDepositNav(uint8 baseDec, uint256 refPrice) internal {
        _setupPair(baseDec, refPrice);
        uint256 shares = _depositQuote(user, 100 ether);
        assertGt(shares, 0, "no shares minted");
        // Absolute NAV is not asserted here: MockProjectXNPM derives position liquidity from the raw
        // token-amount sum, so pool-based getAmountsForLiquidity yields a synthetic value. The real
        // cross-decimal valuation invariant is proven by the withdraw round-trip below (deposit value
        // recovered) and by the fork tests against live pools.
        assertGt(vault.totalAssetsUsdc(), 0, "NAV must be positive after deposit");
    }

    function test_WithdrawReturnsProceeds() public {
        _assertWithdrawRoundTrip(6, 1e15);
        _assertWithdrawRoundTrip(8, 65_000e18);
        _assertWithdrawRoundTrip(18, 3e18);
    }

    function _assertWithdrawRoundTrip(uint8 baseDec, uint256 refPrice) internal {
        _setupPair(baseDec, refPrice);
        uint256 shares = _depositQuote(user, 100 ether);

        vm.prank(user);
        (uint256 amountQuote, uint256 amountBase) = vault.withdraw(shares, user);

        // Value returned (quote + base priced at ref) should approximate the deposit, independent of
        // decimals — withdraw is pro-rata over real balances, so it is immune to the mock's synthetic
        // liquidity magnitude.
        uint256 baseAsQuote = (amountBase * adapter.refPriceUsdc6PerHype18()) / adapter.priceDiv();
        assertApproxEqRel(amountQuote + baseAsQuote, 100 ether, 1e17, "round-trip value drifted >10%");
    }

    // --- quote-denominated dust floor ---------------------------------------------------

    function test_DustFloorLeavesTinyBalancesIdle() public {
        _setupPair(6, 1e15);

        // 0.005 WHYPE (quote) is below the 0.01 WHYPE dust floor: deployIdle must not attempt an LP
        // mint (which would revert on zero liquidity) and must leave the balance untouched.
        uint256 dust = 5e15;
        quote.mint(address(vault), dust);
        vault.deployIdle();
        assertEq(quote.balanceOf(address(vault)), dust, "dust must remain idle in the vault");
    }

    // --- TWAP entry guard ---------------------------------------------------------------

    function test_TwapGuardBlocksDislocatedSpot() public {
        _setupPair(18, 3e18);
        vault.setTwapWindow(900);
        vault.setTwapRequired(true);

        (, int24 spotTick,,,,,) = pool.slot0();
        // TWAP ~2000 ticks below spot ≈ 22% dislocation -> far beyond the 5% default deviation cap.
        pool.setTwapTick(spotTick - 2000);

        quote.mint(user, 10 ether);
        vm.startPrank(user);
        quote.approve(address(vault), type(uint256).max);
        vm.expectRevert("HyperpoolVault: TWAP_DEVIATION");
        vault.depositUSDC(10 ether, user);
        vm.stopPrank();
    }

    function test_TwapGuardAllowsAlignedSpot() public {
        _setupPair(18, 3e18);
        vault.setTwapWindow(900);
        vault.setTwapRequired(true);

        (, int24 spotTick,,,,,) = pool.slot0();
        pool.setTwapTick(spotTick); // TWAP == spot -> 0 deviation

        uint256 shares = _depositQuote(user, 10 ether);
        assertGt(shares, 0, "aligned TWAP must permit deposit");
    }

    function test_TwapRequiredFailsClosedWhenUnavailable() public {
        _setupPair(18, 3e18);
        vault.setTwapWindow(900);
        vault.setTwapRequired(true);
        pool.setObserveReverts(true); // simulate insufficient cardinality / no history

        quote.mint(user, 10 ether);
        vm.startPrank(user);
        quote.approve(address(vault), type(uint256).max);
        vm.expectRevert("HyperpoolVault: TWAP_UNAVAILABLE");
        vault.depositUSDC(10 ether, user);
        vm.stopPrank();
    }

    function test_TwapFailOpenWhenNotRequired() public {
        _setupPair(18, 3e18);
        vault.setTwapWindow(900);
        vault.setTwapRequired(false); // fail-open
        pool.setObserveReverts(true);

        uint256 shares = _depositQuote(user, 10 ether);
        assertGt(shares, 0, "fail-open TWAP must permit deposit when observe reverts");
    }

    // --- deployment wiring guards -------------------------------------------------------

    /// Swapping the vault's quote/base constructor arguments would invert every valuation while
    /// still deploying cleanly, so the vault pins them to the adapter's roles.
    function test_VaultRejectsTokenRolesThatDisagreeWithAdapter() public {
        _setupPair(8, 65_000e18);

        vm.expectRevert("HyperpoolVault: ADAPTER_TOKENS");
        new HyperpoolVault(
            address(adapter),
            address(0),
            0,
            address(quote), // base slot given the quote token
            address(base), // quote slot given the base token
            makeAddr("airdrop2"),
            address(this),
            address(this),
            address(this),
            address(this)
        );
    }

    function test_SetPoolRejectsWrongTickSpacingAndPair() public {
        _setupPair(8, 65_000e18);

        MockUniswapV3Pool wrong = new MockUniswapV3Pool(1 << 96, 0);
        wrong.setIdentity(address(adapter.token0()), address(adapter.token1()), ProjectXConstants.FEE_TIER_DEFAULT, 10);
        vm.expectRevert("ProjectXAdapter: POOL_TICK_SPACING");
        adapter.setPool(address(wrong));

        wrong.setIdentity(makeAddr("otherToken"), address(adapter.token1()), ProjectXConstants.FEE_TIER_DEFAULT, 60);
        vm.expectRevert("ProjectXAdapter: POOL_TOKEN0");
        adapter.setPool(address(wrong));

        // The correctly identified pool is accepted.
        wrong.setIdentity(address(adapter.token0()), address(adapter.token1()), ProjectXConstants.FEE_TIER_DEFAULT, 60);
        adapter.setPool(address(wrong));
        assertEq(address(adapter.pool()), address(wrong));
    }

    /// The dead-share floor is denominated in quote tokens, so it must scale with quote decimals —
    /// a flat 1000 wei protects nothing against an 18-decimal quote.
    function test_MinimumVaultSharesScalesWithQuoteDecimals() public {
        _setupPair(6, 1e15);
        assertEq(vault.minimumVaultShares(), 1e15, "0.001 WHYPE floor for an 18-dec quote");

        _depositQuote(user, 100 ether);
        assertEq(vault.balanceOf(address(0xdEaD)), 1e15, "dead shares locked on first deposit");
    }

    // --- rebalance price bound (no oracle) ----------------------------------------------

    function test_RebalanceRejectsPriceFarFromPool() public {
        _setupPair(8, 65_000e18);
        _depositQuote(user, 100 ether);

        uint256 spot = adapter.currentPoolPriceQuotePerBase18();
        // +20%: far outside the 5% default deviation cap. Stands in for a keeper decimal slip.
        vm.expectRevert("HyperpoolVault: POOL_PRICE_DEVIATION");
        vault.rebalance((spot * 12) / 10);

        // The keeper's actual target — the live pool price — is accepted.
        vault.rebalance(spot);
        assertEq(adapter.refPriceUsdc6PerHype18(), spot);
    }

    // --- helpers ------------------------------------------------------------------------

    function _depositQuote(address who, uint256 amount) internal returns (uint256 shares) {
        quote.mint(who, amount);
        vm.startPrank(who);
        quote.approve(address(vault), type(uint256).max);
        shares = vault.depositUSDC(amount, who);
        vm.stopPrank();
    }
}
