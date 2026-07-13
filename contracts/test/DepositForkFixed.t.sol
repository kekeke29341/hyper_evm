// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract DepositForkFixedTest is Test {
    address constant VAULT = 0x2Efa225A0753010BD63A5c8Ee546E2958e7b7C10;
    address constant ADAPTER = 0xbb047b03f9c6889108ffB77f303a30Fe74A76f70;
    address constant USDC = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;
    address constant USER = 0xF35208BfAdc5f7d38334FD71f42FdDC7eeB85b55;

    function setUp() public { vm.createSelectFork("https://rpc.hyperliquid.xyz/evm"); }

    function test_AcceptsUsdcDeposit() public {
        (uint256 t0, uint256 t1) = ProjectXAdapter(ADAPTER).rangeDepositRatioBps();
        assertGt(t0, 0);
        assertGt(t1, 0);
        uint256 amount = 66_666_666;
        deal(USDC, USER, amount);
        vm.startPrank(USER);
        MockERC20(USDC).approve(VAULT, amount);
        uint256 shares = HyperpoolVault(VAULT).depositUSDC(amount, USER);
        vm.stopPrank();
        assertGt(shares, 0);
        assertGt(HyperpoolVault(VAULT).totalSupply(), 0);
        assertGt(ProjectXAdapter(ADAPTER).positionTokenId(), 0);
    }
}
