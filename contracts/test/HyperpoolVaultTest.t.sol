// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockProjectXNPM} from "../src/mocks/MockProjectXNPM.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";
import {MockUniswapV3Pool} from "../src/mocks/MockUniswapV3Pool.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreOracle} from "../src/core/HyperCoreOracle.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";
import {ProjectXPrice} from "../src/libraries/ProjectXPrice.sol";

contract HyperpoolVaultTest is Test {
    MockERC20 whype;
    MockERC20 usdc;
    MockProjectXNPM npm;
    ProjectXAdapter adapter;
    HyperpoolVault vault;
    MerkleAirdrop airdrop;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address operator = makeAddr("operator");

    address dead = address(0xdEaD);

    function setUp() public {
        whype = new MockERC20("HYPE", "HYPE", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        npm = new MockProjectXNPM();
        airdrop = new MerkleAirdrop(address(usdc));

        address token0 = address(whype) < address(usdc) ? address(whype) : address(usdc);
        address token1 = address(whype) < address(usdc) ? address(usdc) : address(whype);

        adapter = new ProjectXAdapter(
            address(npm),
            token0,
            token1,
            address(usdc),
            address(whype),
            ProjectXConstants.FEE_TIER_500,
            address(this)
        );
        vault = new HyperpoolVault(
            address(adapter),
            address(0),
            0,
            address(whype),
            address(usdc),
            address(airdrop),
            address(this),
            address(this),
            operator
        );
        adapter.setVault(address(vault));

        MockSwapRouter router = new MockSwapRouter(42e6 * 1e12);
        usdc.mint(address(router), 1_000_000e6);
        whype.mint(address(router), 1_000_000 ether);
        vault.setSwapRouter(address(router));
    }

    function test_TokenOrder() public view {
        assertEq(address(adapter.token0()), address(usdc));
        assertEq(address(adapter.token1()), address(whype));
    }

    function test_DepositUSDCMintsShares() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(2000e6, alice);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vault.balanceOf(alice), shares);
        assertGt(adapter.positionTokenId(), 0);
        assertGt(usdc.balanceOf(address(npm)), 0);
        assertGt(whype.balanceOf(address(npm)), 0);
    }

    function test_WithdrawReturnsFundsAfterDeposit() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(2000e6, alice);
        uint256 usdcBefore = usdc.balanceOf(alice);
        (uint256 outUsdc,) = vault.withdraw(shares, alice);
        vm.stopPrank();

        assertGt(outUsdc, 0);
        assertGt(usdc.balanceOf(alice), usdcBefore);
        assertEq(vault.balanceOf(alice), 0);
    }

    function test_SecondDepositUsesSamePosition() public {
        usdc.mint(alice, 10_000e6);
        usdc.mint(bob, 10_000e6);

        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, alice);
        vm.stopPrank();

        uint256 firstId = adapter.positionTokenId();

        vm.startPrank(bob);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(500e6, bob);
        vm.stopPrank();

        assertEq(adapter.positionTokenId(), firstId);
    }

    function test_HarvestFeesSplit3367() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        uint256 tokenId = adapter.positionTokenId();
        npm.accrueFees(tokenId, 1000e6, 0);

        uint256 opBefore = usdc.balanceOf(operator);
        uint256 userShare = vault.harvestFees();

        assertEq(userShare, 670e6);
        assertEq(usdc.balanceOf(operator) - opBefore, 330e6);
        assertEq(vault.pendingUserRewards(), 670e6);
    }

    function test_PullPendingRewardsOnlyAirdrop() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        vault.harvestFees();

        vm.expectRevert("HyperpoolVault: NOT_AIRDROP");
        vault.pullPendingRewards(alice, 100e6);

        vault.pullPendingRewards(address(airdrop), 670e6);
        assertEq(usdc.balanceOf(address(airdrop)), 670e6);
    }

    function test_RebalanceUpdatesTicks() public {
        usdc.mint(alice, 5000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        int24 lowerBefore = adapter.tickLower();
        vault.rebalance(50e6 * 1e12);
        assertTrue(adapter.tickLower() != lowerBefore || adapter.tickUpper() != adapter.tickLower());
    }

    function test_DepositUsesCurrentPoolPriceWhenMarketMoved() public {
        uint256 currentPrice = 67e6 * 1e12;
        bool usdcIsToken0 = address(adapter.token0()) == address(usdc);
        uint160 sqrtPrice = ProjectXPrice.sqrtPriceX96FromRefPrice(currentPrice, usdcIsToken0);
        adapter.setPool(address(new MockUniswapV3Pool(sqrtPrice, 0)));

        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, alice);
        vm.stopPrank();

        assertApproxEqRel(adapter.refPriceUsdc6PerHype18(), currentPrice, 1e12);
        assertGt(usdc.balanceOf(address(npm)), 0);
        assertGt(whype.balanceOf(address(npm)), 0);
    }

    function test_DepositHypeBalancesIntoBothSides() public {
        whype.mint(alice, 100 ether);
        vm.startPrank(alice);
        whype.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositHYPE(1 ether, alice);
        vm.stopPrank();

        assertGt(shares, 0);
        assertGt(usdc.balanceOf(address(npm)), 0);
        assertGt(whype.balanceOf(address(npm)), 0);
    }

    function test_TotalAssetsExcludesPendingRewards() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        uint256 assetsBefore = vault.totalAssetsUsdc();
        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        vault.harvestFees();

        assertEq(vault.totalAssetsUsdc(), assetsBefore);
    }

    function test_FirstDepositLocksMinimumShares() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(2000e6, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(dead), 1000);
    }

    function test_PauseBlocksDeposit() public {
        vault.pause();
        usdc.mint(alice, 1000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert();
        vault.depositUSDC(500e6, alice);
        vm.stopPrank();
    }

    function test_RebalanceRevertsOnOracleDeviation() public {
        HyperCoreOracle oracle = new HyperCoreOracle();
        ProjectXAdapter oracleAdapter = new ProjectXAdapter(
            address(npm),
            address(adapter.token0()),
            address(adapter.token1()),
            address(usdc),
            address(whype),
            ProjectXConstants.FEE_TIER_500,
            address(this)
        );
        HyperpoolVault vaultWithOracle = new HyperpoolVault(
            address(oracleAdapter),
            address(oracle),
            HyperCoreConstants.HYPE_ORACLE_ASSET_ID,
            address(whype),
            address(usdc),
            address(airdrop),
            address(this),
            address(this),
            operator
        );
        oracleAdapter.setVault(address(vaultWithOracle));

        uint256 oraclePx4 = 42e4;
        vm.mockCall(
            HyperCoreConstants.PRECOMPILE_ORACLE_PX,
            abi.encode(HyperCoreConstants.HYPE_ORACLE_ASSET_ID),
            abi.encode(oraclePx4)
        );

        usdc.mint(alice, 5000e6);
        vm.startPrank(alice);
        usdc.approve(address(vaultWithOracle), type(uint256).max);
        vaultWithOracle.depositUSDC(1000e6, alice);
        vm.stopPrank();

        uint256 refPrice = (oraclePx4 * 1e14 * 106) / 100;
        vm.expectRevert("HyperpoolVault: PRICE_DEVIATION");
        vaultWithOracle.rebalance(refPrice);
    }

    function test_HarvestHypeFeesConvertsToUsdcAndSplits() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        npm.accrueFees(adapter.positionTokenId(), 0, 1e18);

        uint256 opUsdcBefore = usdc.balanceOf(operator);
        uint256 userUsdc = vault.harvestFees();

        uint256 swappedUsdc = 42e6;
        uint256 expectedOperator = (swappedUsdc * 3300) / 10_000;
        uint256 expectedUser = swappedUsdc - expectedOperator;

        assertEq(userUsdc, expectedUser);
        assertEq(usdc.balanceOf(operator) - opUsdcBefore, expectedOperator);
        assertEq(vault.pendingUserRewards(), expectedUser);
        assertEq(whype.balanceOf(operator), 0);
    }

    function test_HarvestMixedUsdcAndHypeFeesAllUsdc() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 1e18);

        uint256 opUsdcBefore = usdc.balanceOf(operator);
        uint256 userUsdc = vault.harvestFees();

        uint256 totalUsdc = 1000e6 + 42e6;
        uint256 expectedOperator = (totalUsdc * 3300) / 10_000;
        uint256 expectedUser = totalUsdc - expectedOperator;

        assertEq(userUsdc, expectedUser);
        assertEq(usdc.balanceOf(operator) - opUsdcBefore, expectedOperator);
        assertEq(vault.pendingUserRewards(), expectedUser);
        assertEq(whype.balanceOf(address(vault)), 0);
        assertEq(whype.balanceOf(operator), 0);
    }

    function test_HarvestSkipsSwapWhenConvertDisabled() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        vault.setConvertHypeFeesToUsdc(false);
        npm.accrueFees(adapter.positionTokenId(), 0, 1e18);

        uint256 userUsdc = vault.harvestFees();

        assertEq(userUsdc, 0);
        assertEq(vault.pendingUserRewards(), 0);
        assertEq(whype.balanceOf(operator), (1e18 * 3300) / 10_000);
    }

    function test_WithdrawReservesPendingUserRewards() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(1000e6, alice);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        vault.harvestFees();
        assertEq(vault.pendingUserRewards(), 670e6);

        vm.prank(alice);
        vault.withdraw(shares, alice);

        assertEq(vault.pendingUserRewards(), 670e6);
        assertGe(usdc.balanceOf(address(vault)), 670e6);
    }

    function test_RevertHarvestFeesFromNonKeeper() public {
        vm.prank(alice);
        vm.expectRevert("HyperpoolVault: NOT_KEEPER");
        vault.harvestFees();
    }

    function test_DepositHYPEMintsShares() public {
        whype.mint(alice, 100 ether);
        vm.startPrank(alice);
        whype.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositHYPE(1 ether, alice);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vault.balanceOf(alice), shares);
    }

    function test_MultiUserShareMintingReflectsDeposits() public {
        usdc.mint(alice, 10_000e6);
        usdc.mint(bob, 10_000e6);

        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 aliceShares = vault.depositUSDC(2000e6, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), type(uint256).max);
        uint256 bobShares = vault.depositUSDC(1000e6, bob);
        vm.stopPrank();

        assertGt(aliceShares, bobShares);
        assertGt(bobShares, 0);
        assertGt(vault.balanceOf(alice), vault.balanceOf(bob));
    }

    /// @notice Two equal deposits with no price movement must yield ~equal shares.
    /// Guards against pricing a deposit on a NAV that already includes the incoming funds.
    function test_EqualSequentialDepositsYieldEqualShares() public {
        usdc.mint(alice, 10_000e6);
        usdc.mint(bob, 10_000e6);

        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 aliceShares = vault.depositUSDC(1000e6, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), type(uint256).max);
        uint256 bobShares = vault.depositUSDC(1000e6, bob);
        vm.stopPrank();

        // Only difference allowed is the one-time MINIMUM_VAULT_SHARES lock charged
        // to the very first depositor (alice).
        assertApproxEqAbs(bobShares, aliceShares, 2000);
        assertApproxEqAbs(bobShares, 1000e6, 2);
    }

    /// @notice A HYPE deposit must mint shares for its USDC-equivalent value, not 1e12x more.
    /// Guards the refPrice scaling (USDC6/HYPE * 1e12 → divide by 1e30): a regression to /1e18
    /// would let a tiny HYPE deposit mint enough shares to drain the whole vault.
    function test_DepositHypeValuedConsistentlyWithUsdc() public {
        // refPrice default = 42e6 * 1e12  ->  42 USDC per HYPE
        usdc.mint(alice, 100_000e6);
        whype.mint(bob, 1_000 ether);

        // Alice seeds the vault with 4200 USDC.
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 aliceShares = vault.depositUSDC(4200e6, alice);
        vm.stopPrank();

        // Bob deposits 100 HYPE = 4200 USDC of value -> should get ~the same shares as Alice.
        vm.startPrank(bob);
        whype.approve(address(vault), type(uint256).max);
        uint256 bobShares = vault.depositHYPE(100 ether, bob);
        vm.stopPrank();

        // Equal value in, equal shares out (modulo the first-depositor minimum-share lock).
        assertApproxEqAbs(bobShares, aliceShares, 1000);
    }

    function test_HarvestPullClaimEndToEnd() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, alice);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        uint256 userPool = vault.harvestFees();
        assertEq(userPool, 670e6);

        vault.pullPendingRewards(address(airdrop), userPool);
        assertEq(usdc.balanceOf(address(airdrop)), userPool);

        airdrop.setVaultShareToken(address(vault));
        uint256 aliceShares = vault.balanceOf(alice);
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(alice, userPool, aliceShares))));
        airdrop.setMerkleRoot(leaf, block.timestamp + 1 days);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        airdrop.claim(userPool, aliceShares, new bytes32[](0));
        assertEq(usdc.balanceOf(alice), aliceBefore + userPool);
    }

    function test_RebalanceRevertsWhenOracleUnavailable() public {
        HyperCoreOracle oracle = new HyperCoreOracle();
        ProjectXAdapter oracleAdapter = new ProjectXAdapter(
            address(npm),
            address(adapter.token0()),
            address(adapter.token1()),
            address(usdc),
            address(whype),
            ProjectXConstants.FEE_TIER_500,
            address(this)
        );
        HyperpoolVault vaultWithOracle = new HyperpoolVault(
            address(oracleAdapter),
            address(oracle),
            HyperCoreConstants.HYPE_ORACLE_ASSET_ID,
            address(whype),
            address(usdc),
            address(airdrop),
            address(this),
            address(this),
            operator
        );
        oracleAdapter.setVault(address(vaultWithOracle));

        usdc.mint(alice, 5000e6);
        vm.startPrank(alice);
        usdc.approve(address(vaultWithOracle), type(uint256).max);
        vaultWithOracle.depositUSDC(1000e6, alice);
        vm.stopPrank();

        vm.mockCall(
            address(oracle),
            abi.encodeWithSelector(HyperCoreOracle.tryGetOraclePrice.selector, HyperCoreConstants.HYPE_ORACLE_ASSET_ID),
            abi.encode(0, false)
        );

        vm.expectRevert("HyperpoolVault: ORACLE_UNAVAILABLE");
        vaultWithOracle.rebalance(42e6 * 1e12);
    }

    /// @notice Single-sided USDC deposits must not strand idle WHYPE on the adapter (NAV / withdraw gap).
    function test_DepositUSDCForwardsAdapterIdleToVault() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 deposit = 10e6;
        uint256 shares = vault.depositUSDC(deposit, alice);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(whype.balanceOf(address(adapter)), 0, "idle WHYPE on adapter");
        assertEq(usdc.balanceOf(address(adapter)), 0, "idle USDC on adapter");

        uint256 nav = vault.totalAssetsUsdc();
        assertGe(nav, (deposit * 99) / 100, "NAV should back ~full deposit");
        assertLe(nav, deposit, "NAV should not exceed deposit on fresh vault");
    }

    function test_WithdrawReturnsFullNavAfterUSDCDeposit() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 deposit = 10e6;
        uint256 shares = vault.depositUSDC(deposit, alice);
        uint256 navBefore = vault.totalAssetsUsdc();
        uint256 usdcBefore = usdc.balanceOf(alice);
        uint256 hypeBefore = whype.balanceOf(alice);
        vault.withdraw(shares, alice);
        vm.stopPrank();

        uint256 receivedUsdc = usdc.balanceOf(alice) - usdcBefore;
        uint256 receivedHype = whype.balanceOf(alice) - hypeBefore;
        // Mock pool price ~42 USDC/HYPE — value withdrawn should match NAV within 1%
        uint256 price = adapter.refPriceUsdc6PerHype18();
        uint256 withdrawnValue = receivedUsdc + (receivedHype * price) / 1e30;
        assertGe(withdrawnValue, (navBefore * 99) / 100);
        assertLe(withdrawnValue, navBefore);
    }
}
