// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {FeeCollector} from "../src/core/FeeCollector.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";
import {PointsDistributor} from "../src/core/PointsDistributor.sol";
import {ProjectXFactory} from "../src/core/ProjectXFactory.sol";
import {ProjectXRouter} from "../src/core/ProjectXRouter.sol";
import {ProjectXPair} from "../src/core/ProjectXPair.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreOracle} from "../src/core/HyperCoreOracle.sol";

/// @title DeployLocal — full local stack for Anvil (no big blocks needed)
contract DeployLocal is Script {
    function run() external {
        uint256 deployerPrivateKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        MockERC20 khype = new MockERC20("kHYPE", "kHYPE", 18);
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);

        FeeCollector feeCollector = new FeeCollector();
        ReferralRegistry referralRegistry = new ReferralRegistry();
        PointsDistributor pointsDistributor = new PointsDistributor(address(referralRegistry));
        HyperCoreOracle oracle = new HyperCoreOracle();
        ProjectXFactory factory =
            new ProjectXFactory(address(feeCollector), address(pointsDistributor), deployer);
        ProjectXRouter router = new ProjectXRouter(address(factory));
        factory.setTrustedRouter(address(router));
        MerkleAirdrop airdrop = new MerkleAirdrop(address(usdc));

        factory.createPair(address(khype), address(usdc));
        address pair = factory.getPair(address(khype), address(usdc));
        pointsDistributor.authorizePool(pair);

        khype.mint(deployer, 10_000 ether);
        usdc.mint(deployer, 10_000_000e6);

        khype.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(khype), address(usdc), 1000 ether, 2_000_000e6, 0, 0, deployer, block.timestamp + 3600
        );

        vm.stopBroadcast();

        string memory obj = "deployment";
        string memory json = vm.serializeUint(obj, "chainId", block.chainid);
        json = vm.serializeBool(obj, "deployed", true);
        json = vm.serializeAddress(obj, "feeCollector", address(feeCollector));
        json = vm.serializeAddress(obj, "referralRegistry", address(referralRegistry));
        json = vm.serializeAddress(obj, "pointsDistributor", address(pointsDistributor));
        json = vm.serializeAddress(obj, "oracle", address(oracle));
        json = vm.serializeAddress(obj, "factory", address(factory));
        json = vm.serializeAddress(obj, "router", address(router));
        json = vm.serializeAddress(obj, "pair", pair);
        json = vm.serializeAddress(obj, "pointsDistributor", address(pointsDistributor));
        json = vm.serializeAddress(obj, "referralRegistry", address(referralRegistry));
        json = vm.serializeAddress(obj, "airdrop", address(airdrop));
        json = vm.serializeAddress(obj, "tokenKHYPE", address(khype));
        json = vm.serializeAddress(obj, "tokenUSDC", address(usdc));

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console2.log("Deployed to chain", block.chainid);
        console2.log("HyperCoreOracle", address(oracle));
        console2.log("Router", address(router));
        console2.log("Pair", pair);
        console2.log("kHYPE", address(khype));
        console2.log("USDC", address(usdc));
    }
}
