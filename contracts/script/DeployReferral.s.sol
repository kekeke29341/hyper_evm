// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";

/// @title DeployReferral — standalone ReferralRegistry for existing Hyperpool stacks
contract DeployReferral is Script {
    function run() external {
        uint256 chainId = block.chainid;
        require(
            chainId == HyperCoreConstants.CHAIN_ID_TESTNET
                || chainId == HyperCoreConstants.CHAIN_ID_MAINNET
                || chainId == 31337,
            "DeployReferral: unsupported chain"
        );

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        ReferralRegistry referral = new ReferralRegistry();

        vm.stopBroadcast();

        console2.log("ReferralRegistry", address(referral));
        console2.log("Run: node scripts/finalize-referral.mjs", chainId);
    }
}
