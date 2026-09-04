// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {IUniswapV3Pool} from "../src/interfaces/IUniswapV3Pool.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";
import {TickMath} from "../src/libraries/TickMath.sol";

/// @title HypeQuotedMainnetFork — dry deploy of the HYPE-quoted pairs against live mainnet state
/// @dev This is the decimal-scaling guard the mock harness cannot provide: MockProjectXNPM derives
///      liquidity from a raw token-amount sum, so it hides exponent errors. Here every read is the
///      real thing — the live Project X factory pools, their real slot0, real 6/8/18-decimal base
///      tokens, the shared NPM and the shared SwapRouter.
///
///      All three pools were confirmed against the canonical Project X factory
///      (0xFf7B3e8C00e57ea31477c32A5B52a58Eea47b072) via getPool(base, WHYPE, 3000).
///
///      Run: forge test --match-path 'test/HypeQuotedMainnetFork.t.sol' -vv
contract HypeQuotedMainnetFork is Test {
    address constant WHYPE = 0x5555555555555555555555555555555555555555;
    address constant FACTORY = 0xFf7B3e8C00e57ea31477c32A5B52a58Eea47b072;

    address constant UPUMP = 0x27eC642013bcB3D80CA3706599D3cdA04F6f4452; // 6 dec
    address constant UBTC = 0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463; // 8 dec
    address constant UETH = 0xBe6727B535545C67d5cAa73dEa54865B92CF7907; // 18 dec

    address constant POOL_UPUMP = 0x78cc152A531DBde2F3Fe7001ad659fa120Fa893b;
    address constant POOL_UBTC = 0x0D6ECB912b6ee160e95Bc198b618Acc1bCb92525;
    address constant POOL_UETH = 0xaf80230eB13222DB743C21762f65A046bb5F5437;

    uint32 constant TWAP_WINDOW = 900;

    address owner = address(this);
    address user = makeAddr("forkUser");

    ProjectXAdapter adapter;
    HyperpoolVault vault;

    function setUp() public {
        vm.createSelectFork("https://rpc.hyperliquid.xyz/evm");
    }

    // -----------------------------------------------------------------------
    // Deploy exactly what DeployHyperpoolPair deploys, against the live chain.
    // -----------------------------------------------------------------------
    function _deployPair(address baseToken, address pool) internal {
        address token0 = baseToken < WHYPE ? baseToken : WHYPE;
        address token1 = baseToken < WHYPE ? WHYPE : baseToken;

        MerkleAirdrop airdrop = new MerkleAirdrop(WHYPE);
        adapter = new ProjectXAdapter(
            ProjectXConstants.NPM_MAINNET,
            token0,
            token1,
            WHYPE, // quote
            baseToken, // base
            ProjectXConstants.FEE_TIER_3000,
            1e18, // placeholder ref price, overwritten from the pool below
            owner
        );
        vault = new HyperpoolVault(
            address(adapter),
            address(0), // no HyperCore oracle for HYPE-quoted pools
            0,
            baseToken, // legacy tokenWHYPE slot = base
            WHYPE, // legacy tokenUSDC slot = quote
            address(airdrop),
            owner,
            owner,
            owner,
            owner
        );

        adapter.setVault(address(vault));
        adapter.setPool(pool); // reverts unless pair/fee/tickSpacing all match
        adapter.setRangeBps(500, 500);
        airdrop.setVaultShareToken(address(vault));
        vault.setSwapRouter(ProjectXConstants.SWAP_ROUTER_MAINNET);
        vault.setTwapWindow(TWAP_WINDOW);
    }

    /// @dev Independent recomputation of quote-per-base*1e18 straight from the pool's sqrtPrice,
    ///      deliberately NOT sharing code with the adapter, so an exponent error in either shows up.
    function _expectedQuotePerBase18(address pool, address baseToken) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
        uint256 p = uint256(sqrtPriceX96);
        uint8 baseDec = IERC20Metadata(baseToken).decimals();
        bool quoteIsToken0 = IUniswapV3Pool(pool).token0() == WHYPE;

        // rawToken1PerToken0 = sqrt^2 / 2^192, carried at 1e18 precision throughout.
        uint256 rawX18 = FullMulDiv.mulDiv(FullMulDiv.mulDiv(p, p, 1 << 96), 1e18, 1 << 96);

        if (quoteIsToken0) {
            // token0 = WHYPE(18) quote, token1 = base(baseDec). raw = base_raw per quote_raw.
            // quotePerBase_human = (1 / raw) * 10^baseDec / 10^18
            //                    = 1e18 / raw  scaled: (1e18 * 1e18 / rawX18) * 10^baseDec / 1e18
            return FullMulDiv.mulDiv(1e18, 10 ** uint256(baseDec), rawX18);
        }
        // token0 = base(baseDec), token1 = WHYPE(18) quote. raw = quote_raw per base_raw.
        // quotePerBase_human = raw * 10^baseDec / 10^18
        return FullMulDiv.mulDiv(rawX18, 10 ** uint256(baseDec), 1e18);
    }

    // -----------------------------------------------------------------------
    // Per-pair checks
    // -----------------------------------------------------------------------
    function test_UETH_18dec() public {
        _runPair(UETH, POOL_UETH, 18, 1e18, "UETH/HYPE");
    }

    function test_UBTC_8dec() public {
        _runPair(UBTC, POOL_UBTC, 8, 1e8, "UBTC/HYPE");
    }

    function test_UPUMP_6dec() public {
        _runPair(UPUMP, POOL_UPUMP, 6, 1e6, "UPUMP/HYPE");
    }

    function _runPair(
        address baseToken,
        address pool,
        uint8 expectedBaseDec,
        uint256 expectedPriceDiv,
        string memory label
    ) internal {
        // The pool must be the one the factory returns for (base, WHYPE, 0.3%).
        assertEq(
            IProjectXFactory(FACTORY).getPool(baseToken, WHYPE, ProjectXConstants.FEE_TIER_3000),
            pool,
            "pool is not the factory's canonical base/WHYPE 0.3% pool"
        );

        _deployPair(baseToken, pool);

        console2.log("=== ", label);
        assertEq(adapter.baseDecimals(), expectedBaseDec, "base decimals");
        assertEq(adapter.quoteDecimals(), 18, "quote decimals (WHYPE)");
        assertEq(adapter.priceDiv(), expectedPriceDiv, "priceDiv");
        assertEq(vault.priceDiv(), expectedPriceDiv, "vault mirrors priceDiv");
        assertEq(vault.dustDepositQuote(), 1e16, "0.01 WHYPE dust floor");
        assertEq(vault.minimumVaultShares(), 1e15, "0.001 WHYPE dead-share floor");

        // --- price scale against real slot0 --------------------------------
        uint256 got = adapter.currentPoolPriceQuotePerBase18();
        uint256 want = _expectedQuotePerBase18(pool, baseToken);
        console2.log("  quotePerBase18 adapter", got);
        console2.log("  quotePerBase18 expected", want);
        assertApproxEqRel(got, want, 1e15, "pool price scale (exponent bug guard)");
        assertGt(got, 0, "price must be non-zero");

        // --- +/-5% ticks around the live price -----------------------------
        (, int24 liveTick,,,,,) = IUniswapV3Pool(pool).slot0();
        vm.prank(address(vault));
        adapter.syncRefPriceFromPool();

        _seedAndDeploy(baseToken);

        int24 lower = adapter.tickLower();
        int24 upper = adapter.tickUpper();
        console2.log("  liveTick", liveTick);
        console2.log("  tickLower", lower);
        console2.log("  tickUpper", upper);
        assertEq(lower % 60, 0, "lower tick not spacing-aligned");
        assertEq(upper % 60, 0, "upper tick not spacing-aligned");
        assertLt(lower, upper, "inverted range");
        assertTrue(liveTick > lower && liveTick < upper, "live tick must sit inside the managed range");
        // +/-5% in price is ~+/-487 ticks; allow the spacing rounding on each side.
        int24 width = upper - lower;
        assertGt(width, 900, "range narrower than +/-5%");
        assertLt(width, 1100, "range wider than +/-5%");

        // --- TWAP availability ---------------------------------------------
        uint32[] memory ago = new uint32[](2);
        ago[0] = TWAP_WINDOW;
        ago[1] = 0;
        try IUniswapV3Pool(pool).observe(ago) returns (int56[] memory, uint160[] memory) {
            console2.log("  observe(900s): OK -> twapRequired(true) is safe today");
        } catch {
            console2.log("  observe(900s): REVERTS -> grow cardinality / wait before setTwapRequired(true)");
        }
    }

    /// @dev A real deposit through the real router + NPM, then a full withdraw, checking that the
    ///      quote-denominated value survives the round trip. This is where a wrong priceDiv would
    ///      surface as mispriced shares or a reverting mint.
    function _seedAndDeploy(address baseToken) internal {
        uint256 depositAmount = 1 ether; // 1 WHYPE
        deal(WHYPE, user, depositAmount);

        vm.startPrank(user);
        IERC20(WHYPE).approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(depositAmount, user);
        vm.stopPrank();

        assertGt(shares, 0, "deposit minted no shares");
        assertGt(adapter.positionTokenId(), 0, "no NPM position minted");

        uint256 nav = vault.totalAssetsUsdc();
        console2.log("  shares", shares);
        console2.log("  NAV (WHYPE wei)", nav);
        // NAV is quote-denominated; the deposit was 1 WHYPE. Swap fees + LP rounding cost a few
        // percent, so allow 10% — an exponent error would be off by 10^2 or more, not 10%.
        assertApproxEqRel(nav, depositAmount, 1e17, "NAV must recover the deposit in quote terms");

        vm.prank(user);
        (uint256 outQuote, uint256 outBase) = vault.withdraw(shares, user);

        uint256 baseAsQuote =
            (outBase * adapter.currentPoolPriceQuotePerBase18()) / adapter.priceDiv();
        console2.log("  withdraw quote", outQuote);
        console2.log("  withdraw base", outBase);
        console2.log("  round-trip value (WHYPE wei)", outQuote + baseAsQuote);
        assertApproxEqRel(
            outQuote + baseAsQuote, depositAmount, 1e17, "round-trip value drifted >10% (decimal bug?)"
        );

        // Re-seed a position so the caller's tick assertions have something to read.
        deal(WHYPE, user, depositAmount);
        vm.startPrank(user);
        IERC20(WHYPE).approve(address(vault), type(uint256).max);
        vault.depositUSDC(depositAmount, user);
        vm.stopPrank();
        assertEq(IERC20Metadata(baseToken).decimals(), adapter.baseDecimals(), "base decimals drifted");
    }
}

interface IProjectXFactory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

/// @dev Local 512-bit mulDiv so the expected-price recomputation shares no code with the adapter.
library FullMulDiv {
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            uint256 prod0;
            uint256 prod1;
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }
            if (prod1 == 0) {
                require(denominator > 0, "mulDiv: 0");
                return prod0 / denominator;
            }
            require(denominator > prod1, "mulDiv: overflow");
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            uint256 inv = (3 * denominator) ^ 2;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            result = prod0 * inv;
        }
    }
}
