// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";

/// @dev Read-only checks against deployed Mainnet 999 registry.
contract ReferralRegistryMainnetForkTest is Test {
    ReferralRegistry constant REGISTRY = ReferralRegistry(0x3934Abcb5824326B59deBDb7c3410A7648b09CD2);
    address constant OPS = 0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC", string("https://rpc.hyperliquid.xyz/evm"));
        vm.createSelectFork(rpc);
    }

    function test_MainnetOpsWalletIsRegisteredReferrer() public view {
        assertTrue(REGISTRY.isRegisteredReferrer(OPS), "ops wallet must be registered");
    }

    function test_MainnetRegistryBytecodeExists() public view {
        assertGt(address(REGISTRY).code.length, 0, "registry must have bytecode");
    }
}
