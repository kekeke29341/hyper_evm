// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockProjectXNPM} from "../src/mocks/MockProjectXNPM.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";

/// @dev Verifies owner / operator / user withdrawal paths and accidental-send behavior.
contract AdminFundRecoveryTest is Test {
    MockERC20 whype;
    MockERC20 usdc;
    MockProjectXNPM npm;
    ProjectXAdapter adapter;
    HyperpoolVault vault;
    MerkleAirdrop airdrop;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address user = makeAddr("user");
    address dead = address(0xdEaD);

    function setUp() public {
        whype = new MockERC20("HYPE", "HYPE", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        npm = new MockProjectXNPM();

        address token0 = address(whype) < address(usdc) ? address(whype) : address(usdc);
        address token1 = address(whype) < address(usdc) ? address(usdc) : address(whype);

        vm.startPrank(owner);
        airdrop = new MerkleAirdrop(address(usdc));
        adapter = new ProjectXAdapter(
            address(npm),
            token0,
            token1,
            address(usdc),
            address(whype),
            ProjectXConstants.FEE_TIER_500,
            owner
        );
        vault = new HyperpoolVault(
            address(adapter),
            address(0),
            0,
            address(whype),
            address(usdc),
            address(airdrop),
            owner,
            owner,
            operator
        );
        adapter.setVault(address(vault));
        MockSwapRouter router = new MockSwapRouter(42e6 * 1e12);
        usdc.mint(address(router), 1_000_000e6);
        whype.mint(address(router), 1_000_000 ether);
        vault.setSwapRouter(address(router));
        vm.stopPrank();
    }

    function test_OwnerDepositsAndWithdrawsFullBalance() public {
        usdc.mint(owner, 10_000e6);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(5000e6, owner);
        uint256 before = usdc.balanceOf(owner);
        (uint256 outUsdc,) = vault.withdraw(shares, owner);
        vm.stopPrank();

        assertGt(outUsdc, 0);
        assertGt(usdc.balanceOf(owner), before);
        assertEq(vault.balanceOf(owner), 0);
    }

    function test_OperatorReceivesHarvestShareToWallet() public {
        usdc.mint(user, 10_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, user);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);

        uint256 opBefore = usdc.balanceOf(operator);
        vm.prank(owner);
        vault.harvestFees();

        assertEq(usdc.balanceOf(operator) - opBefore, 330e6);
        assertEq(vault.pendingUserRewards(), 670e6);
    }

    function test_OwnerPullsPendingToAirdropThenDistributesToUser() public {
        usdc.mint(user, 10_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, user);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        vm.prank(owner);
        uint256 userPool = vault.harvestFees();

        vm.prank(owner);
        vault.pullPendingRewards(address(airdrop), userPool);
        assertEq(usdc.balanceOf(address(airdrop)), userPool);

        uint256 ownerBefore = usdc.balanceOf(owner);
        uint256 userBefore = usdc.balanceOf(user);
        address[] memory accounts = new address[](1);
        accounts[0] = user;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = userPool;

        vm.prank(owner);
        airdrop.distributeRewards(keccak256("daily-1"), accounts, amounts);

        assertEq(usdc.balanceOf(owner), ownerBefore);
        assertEq(usdc.balanceOf(user) - userBefore, userPool);
        assertEq(usdc.balanceOf(address(airdrop)), 0);
    }

    function test_PullPendingRewardsRejectsNonAirdropRecipient() public {
        usdc.mint(user, 10_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, user);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        vm.prank(owner);
        vault.harvestFees();

        vm.prank(owner);
        vm.expectRevert("HyperpoolVault: NOT_AIRDROP");
        vault.pullPendingRewards(owner, 100e6);
    }

    function test_AccidentalUsdcToVault_NotWithdrawableByOwnerWithoutShares() public {
        usdc.mint(user, 10_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, user);
        vm.stopPrank();

        usdc.mint(address(this), 500e6);
        usdc.transfer(address(vault), 500e6);

        uint256 ownerBefore = usdc.balanceOf(owner);
        assertEq(vault.balanceOf(owner), 0);

        vm.prank(owner);
        vm.expectRevert();
        vault.withdraw(1, owner);

        assertEq(usdc.balanceOf(owner), ownerBefore);
        assertGe(usdc.balanceOf(address(vault)), 500e6);
    }

    function test_AccidentalUsdcToVault_WithdrawableViaSharesWhenSoleDepositor() public {
        usdc.mint(owner, 10_000e6);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(1000e6, owner);
        vm.stopPrank();

        usdc.mint(address(this), 300e6);
        usdc.transfer(address(vault), 300e6);

        uint256 ownerBefore = usdc.balanceOf(owner);
        vm.prank(owner);
        (uint256 outUsdc, uint256 outHype) = vault.withdraw(shares, owner);

        assertGt(outUsdc, 700e6);
        assertGt(outHype, 0);
        assertGt(usdc.balanceOf(owner), ownerBefore + 700e6);
    }

    function test_AccidentalUsdcToAdapter_OnlyVaultCanMove() public {
        usdc.mint(address(this), 200e6);
        usdc.transfer(address(adapter), 200e6);
        assertEq(usdc.balanceOf(address(adapter)), 200e6);

        vm.prank(owner);
        vm.expectRevert("ProjectXAdapter: NOT_VAULT");
        adapter.deposit(200e6, 0);
    }

    function test_OwnerRecoversIdleUsdcFromAdapter() public {
        usdc.mint(address(this), 200e6);
        usdc.transfer(address(adapter), 200e6);

        uint256 before = usdc.balanceOf(owner);
        vm.prank(owner);
        adapter.recoverToken(usdc, owner, 200e6);

        assertEq(usdc.balanceOf(owner), before + 200e6);
        assertEq(usdc.balanceOf(address(adapter)), 0);
    }

    function test_OwnerRecoversForeignTokenFromVault() public {
        MockERC20 stray = new MockERC20("STRAY", "STRAY", 18);
        stray.mint(address(vault), 100e18);

        vm.prank(owner);
        vault.recoverForeignToken(stray, owner, 100e18);
        assertEq(stray.balanceOf(owner), 100e18);
    }

    function test_VaultRejectsRecoverUnderlyingUsdc() public {
        usdc.mint(address(vault), 100e6);

        vm.prank(owner);
        vm.expectRevert("HyperpoolVault: UNDERLYING");
        vault.recoverForeignToken(usdc, owner, 100e6);
    }

    function test_VaultRejectsRecoverUnderlyingWhype() public {
        whype.mint(address(vault), 1 ether);

        vm.prank(owner);
        vm.expectRevert("HyperpoolVault: UNDERLYING");
        vault.recoverForeignToken(whype, owner, 1 ether);
    }

    function test_NonOwnerCannotRecoverFromAdapter() public {
        usdc.mint(address(adapter), 50e6);

        vm.prank(user);
        vm.expectRevert();
        adapter.recoverToken(usdc, user, 50e6);
    }

    function test_NonOwnerCannotRecoverForeignFromVault() public {
        MockERC20 stray = new MockERC20("STRAY", "STRAY", 18);
        stray.mint(address(vault), 1e18);

        vm.prank(user);
        vm.expectRevert();
        vault.recoverForeignToken(stray, user, 1e18);
    }

    function test_RecoverAdapterDoesNotDrainNpmPosition() public {
        usdc.mint(user, 10_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, user);
        vm.stopPrank();

        uint256 navBefore = adapter.totalAssetsUsdc(42e6 * 1e12);

        usdc.mint(address(this), 100e6);
        usdc.transfer(address(adapter), 100e6);

        vm.prank(owner);
        adapter.recoverToken(usdc, owner, 100e6);

        assertEq(adapter.totalAssetsUsdc(42e6 * 1e12), navBefore);
    }

    function test_NonOwnerCannotHarvestOrPull() public {
        usdc.mint(user, 10_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositUSDC(1000e6, user);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);

        vm.prank(user);
        vm.expectRevert("HyperpoolVault: NOT_KEEPER");
        vault.harvestFees();

        vm.prank(user);
        vm.expectRevert();
        vault.pullPendingRewards(address(airdrop), 1);
    }

    function test_UserWithdrawExcludesPendingUserRewards() public {
        usdc.mint(user, 10_000e6);
        vm.startPrank(user);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(1000e6, user);
        vm.stopPrank();

        npm.accrueFees(adapter.positionTokenId(), 1000e6, 0);
        vm.prank(owner);
        vault.harvestFees();

        uint256 pending = vault.pendingUserRewards();
        assertGt(pending, 0);

        vm.prank(user);
        vault.withdraw(shares, user);

        assertEq(vault.pendingUserRewards(), pending);
        assertGe(usdc.balanceOf(address(vault)), pending);
    }

    function test_DeadSharesRemainAfterFullOwnerWithdraw() public {
        usdc.mint(owner, 10_000e6);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        uint256 shares = vault.depositUSDC(1000e6, owner);
        vault.withdraw(shares, owner);
        vm.stopPrank();

        assertEq(vault.balanceOf(owner), 0);
        assertEq(vault.balanceOf(dead), 1000);
    }
}
