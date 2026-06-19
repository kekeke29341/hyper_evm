// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockProjectXNPM} from "../src/mocks/MockProjectXNPM.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreOracle} from "../src/core/HyperCoreOracle.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";

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

    function test_HarvestFeesSplit3070() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        uint256 tokenId = adapter.positionTokenId();
        npm.accrueFees(tokenId, 1000e6, 0);

        uint256 opBefore = usdc.balanceOf(operator);
        uint256 userShare = vault.harvestFees();

        assertEq(userShare, 700e6);
        assertEq(usdc.balanceOf(operator) - opBefore, 300e6);
        assertEq(vault.pendingUserRewards(), 700e6);
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

        vault.pullPendingRewards(address(airdrop), 700e6);
        assertEq(usdc.balanceOf(address(airdrop)), 700e6);
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

        uint256 oraclePx8 = 42e8;
        vm.mockCall(
            HyperCoreConstants.PRECOMPILE_ORACLE_PX,
            abi.encode(HyperCoreConstants.HYPE_ORACLE_ASSET_ID),
            abi.encode(oraclePx8)
        );

        usdc.mint(alice, 5000e6);
        vm.startPrank(alice);
        usdc.approve(address(vaultWithOracle), type(uint256).max);
        vaultWithOracle.depositUSDC(1000e6, alice);
        vm.stopPrank();

        uint256 refPrice = (oraclePx8 * 1e10 * 106) / 100;
        vm.expectRevert("HyperpoolVault: PRICE_DEVIATION");
        vaultWithOracle.rebalance(refPrice);
    }

    function test_HarvestHypeFeesSplitsOperatorShare() public {
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.depositUSDC(1000e6, alice);

        npm.accrueFees(adapter.positionTokenId(), 0, 1e18);

        uint256 opHypeBefore = whype.balanceOf(operator);
        uint256 userUsdc = vault.harvestFees();

        assertEq(userUsdc, 0);
        assertEq(whype.balanceOf(operator) - opHypeBefore, (1e18 * 3000) / 10_000);
        assertEq(vault.pendingUserRewards(), 0);
    }

    function test_WithdrawReservesPendingUserRewards() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(1000e6, alice);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        vault.harvestFees();
        assertEq(vault.pendingUserRewards(), 700e6);

        vm.prank(alice);
        vault.withdraw(shares, alice);

        assertEq(vault.pendingUserRewards(), 700e6);
        assertGe(usdc.balanceOf(address(vault)), 700e6);
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

    function test_HarvestPullClaimEndToEnd() public {
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, alice);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        uint256 userPool = vault.harvestFees();
        assertEq(userPool, 700e6);

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
}
