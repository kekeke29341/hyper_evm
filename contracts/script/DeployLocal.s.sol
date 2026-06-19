// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockProjectXNPM} from "../src/mocks/MockProjectXNPM.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreOracle} from "../src/core/HyperCoreOracle.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";

/// @title DeployLocal — Anvil stack with mock Project X NPM
contract DeployLocal is Script {
    function run() external {
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        MockERC20 whype = new MockERC20("HYPE", "HYPE", 18);
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        MockProjectXNPM npm = new MockProjectXNPM();

        HyperCoreOracle oracle = new HyperCoreOracle();
        MerkleAirdrop airdrop = new MerkleAirdrop(address(usdc));
        ReferralRegistry referral = new ReferralRegistry();

        address token0 = address(whype) < address(usdc) ? address(whype) : address(usdc);
        address token1 = address(whype) < address(usdc) ? address(usdc) : address(whype);

        ProjectXAdapter adapter = new ProjectXAdapter(
            address(npm),
            token0,
            token1,
            address(usdc),
            address(whype),
            ProjectXConstants.FEE_TIER_500,
            deployer
        );

        HyperpoolVault vault = new HyperpoolVault(
            address(adapter),
            address(oracle),
            HyperCoreConstants.HYPE_ORACLE_ASSET_ID,
            address(whype),
            address(usdc),
            address(airdrop),
            deployer,
            deployer,
            deployer
        );

        adapter.setVault(address(vault));

        whype.mint(deployer, 10_000 ether);
        usdc.mint(deployer, 10_000_000e6);

        vm.stopBroadcast();

        string memory obj = "deployment";
        string memory json = vm.serializeUint(obj, "chainId", block.chainid);
        json = vm.serializeBool(obj, "deployed", true);
        json = vm.serializeAddress(obj, "oracle", address(oracle));
        json = vm.serializeAddress(obj, "projectXAdapter", address(adapter));
        json = vm.serializeAddress(obj, "hyperpoolVault", address(vault));
        json = vm.serializeAddress(obj, "liquidityVault", address(vault));
        json = vm.serializeAddress(obj, "airdrop", address(airdrop));
        json = vm.serializeAddress(obj, "referralRegistry", address(referral));
        json = vm.serializeAddress(obj, "projectXNpm", address(npm));
        json = vm.serializeAddress(obj, "tokenKHYPE", address(whype));
        json = vm.serializeAddress(obj, "tokenUSDC", address(usdc));

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console2.log("Deployed to chain", block.chainid);
        console2.log("HyperpoolVault", address(vault));
        console2.log("ProjectXAdapter", address(adapter));
        console2.log("WHYPE", address(whype));
        console2.log("USDC", address(usdc));
    }
}
