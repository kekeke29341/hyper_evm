// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FeeCollector} from "../src/core/FeeCollector.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract FeeCollectorTest is Test {
    FeeCollector collector;
    MockERC20 token;
    address owner;
    address stranger = makeAddr("stranger");
    address recipient = makeAddr("recipient");

    function setUp() public {
        owner = address(this);
        collector = new FeeCollector();
        token = new MockERC20("USDC", "USDC", 6);
        token.mint(address(collector), 1000e6);
        vm.deal(address(collector), 1 ether);
    }

    function test_WithdrawErc20() public {
        collector.withdraw(address(token), recipient, 500e6);
        assertEq(token.balanceOf(recipient), 500e6);
    }

    function test_WithdrawEth() public {
        collector.withdraw(address(0), recipient, 0.5 ether);
        assertEq(recipient.balance, 0.5 ether);
    }

    function test_RevertWithdrawZeroRecipient() public {
        vm.expectRevert("FeeCollector: ZERO_RECIPIENT");
        collector.withdraw(address(token), address(0), 1);
    }

    function test_RevertWithdrawNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        collector.withdraw(address(token), recipient, 1);
    }

    function test_ReceiveEth() public {
        (bool ok,) = address(collector).call{value: 0.1 ether}("");
        assertTrue(ok);
        assertEq(address(collector).balance, 1.1 ether);
    }
}
