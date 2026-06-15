// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {PoolHandler} from "./PoolHandler.sol";

contract ProjectXInvariant is StdInvariant, Test {
    PoolHandler public handler;

    function setUp() public {
        handler = new PoolHandler();
        targetContract(address(handler));
    }

    function invariant_reservesMatchBalances() public view {
        handler.assertReservesMatchBalances();
    }

    function invariant_lpSupplyPositive() public view {
        assertGt(handler.pair().totalSupply(), 0);
    }

    function invariant_epochBasePointsNeverExceedPool() public view {
        handler.assertEpochBasePointsCapped();
    }

    function invariant_kNeverDecreasesOnSwap() public view {
        handler.assertKNeverDecreasesOnSwap();
    }
}
