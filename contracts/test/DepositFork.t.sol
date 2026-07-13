// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @dev Regression for mainnet deposit failures when refPrice ($42) lags pool spot (~$67).
contract DepositForkTest is Test {
    address constant BROKEN_VAULT = 0xA3f52f8288ae7caDF1C794D03e8245B4BF5499a8;
    address constant BROKEN_ADAPTER = 0xb62965C1A4dC5F2386FBC0E5719D41AB85DaaA87;
    address constant USDC = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;
    address constant USER = 0xF35208BfAdc5f7d38334FD71f42FdDC7eeB85b55;

    function setUp() public {
        vm.createSelectFork("https://rpc.hyperliquid.xyz/evm");
    }

    function test_BrokenDeploymentRevertsUsdcDeposit() public {
        ProjectXAdapter adapter = ProjectXAdapter(BROKEN_ADAPTER);
        (uint256 t0Bps, uint256 t1Bps) = adapter.rangeDepositRatioBps();
        assertEq(t0Bps, 0);
        assertEq(t1Bps, 10_000);

        uint256 amount = 66_666_666;
        deal(USDC, USER, amount);
        vm.startPrank(USER);
        MockERC20(USDC).approve(BROKEN_VAULT, amount);
        vm.expectRevert();
        HyperpoolVault(BROKEN_VAULT).depositUSDC(amount, USER);
        vm.stopPrank();
    }
}
