// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreOracle} from "../src/core/HyperCoreOracle.sol";
import {MockProjectXNPM} from "../src/mocks/MockProjectXNPM.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";

/// @title DeployHyperpool — Project X proxy LP vault for HyperEVM
contract DeployHyperpool is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;

        require(
            chainId == HyperCoreConstants.CHAIN_ID_TESTNET || chainId == HyperCoreConstants.CHAIN_ID_MAINNET,
            "DeployHyperpool: wrong chain"
        );

        address whype = HyperCoreConstants.khypeForChain(chainId);
        address usdc = HyperCoreConstants.usdcForChain(chainId);
        address npm = ProjectXConstants.npmForChain(chainId);

        vm.startBroadcast(deployerPrivateKey);

        if (npm == address(0) && chainId == HyperCoreConstants.CHAIN_ID_TESTNET) {
            MockProjectXNPM mockNpm = new MockProjectXNPM();
            npm = address(mockNpm);
            console2.log("Deployed MockProjectXNPM for testnet", npm);
        }

        address swapRouter = ProjectXConstants.swapRouterForChain(chainId);
        if (swapRouter == address(0) && chainId == HyperCoreConstants.CHAIN_ID_TESTNET) {
            MockSwapRouter mockRouter = new MockSwapRouter(42e6 * 1e12);
            swapRouter = address(mockRouter);
            console2.log("Deployed MockSwapRouter for testnet", swapRouter);
        }

        require(npm != address(0), "DeployHyperpool: NPM not configured for chain");

        address token0 = whype < usdc ? whype : usdc;
        address token1 = whype < usdc ? usdc : whype;

        HyperCoreOracle oracle = new HyperCoreOracle();
        MerkleAirdrop airdrop = new MerkleAirdrop(usdc);
        ReferralRegistry referral = new ReferralRegistry();

        ProjectXAdapter adapter = new ProjectXAdapter(
            npm,
            token0,
            token1,
            usdc,
            whype,
            ProjectXConstants.FEE_TIER_500,
            deployer
        );

        HyperpoolVault vault = new HyperpoolVault(
            address(adapter),
            address(oracle),
            HyperCoreConstants.HYPE_ORACLE_ASSET_ID,
            whype,
            usdc,
            address(airdrop),
            deployer,
            deployer,
            deployer
        );

        adapter.setVault(address(vault));

        airdrop.setVaultShareToken(address(vault));

        if (swapRouter != address(0)) {
            vault.setSwapRouter(swapRouter);
            console2.log("Swap router configured", swapRouter);
            if (chainId == HyperCoreConstants.CHAIN_ID_TESTNET) {
                uint256 fund = 100e6;
                if (IERC20(usdc).balanceOf(deployer) >= fund) {
                    IERC20(usdc).transfer(swapRouter, fund);
                    console2.log("MockSwapRouter prefunded USDC", fund);
                }
            }
        }

        address pool = ProjectXConstants.poolForChain(chainId);
        if (pool != address(0)) {
            adapter.setPool(pool);
            console2.log("ProjectX pool configured", pool);
        }

        vm.stopBroadcast();

        console2.log("Chain", chainId);
        console2.log("HyperCoreOracle", address(oracle));
        console2.log("ProjectXAdapter", address(adapter));
        console2.log("HyperpoolVault", address(vault));
        console2.log("MerkleAirdrop", address(airdrop));
        console2.log("ReferralRegistry", address(referral));
        console2.log("NPM", npm);
        console2.log("WHYPE", whype);
        console2.log("USDC", usdc);

        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _writeDeployment(
                chainId,
                address(oracle),
                address(adapter),
                address(vault),
                address(airdrop),
                address(referral),
                whype,
                usdc,
                npm
            );
        } else {
            console2.log("Deployment JSON skipped during broadcast; run scripts/finalize-deployment.mjs after receipts.");
        }
    }

    function _writeDeployment(
        uint256 chainId,
        address oracle,
        address adapter,
        address vault,
        address airdrop,
        address referral,
        address whype,
        address usdc,
        address npm
    ) internal {
        string memory obj = "deployment";
        string memory json = vm.serializeUint(obj, "chainId", chainId);
        json = vm.serializeBool(obj, "deployed", true);
        json = vm.serializeAddress(obj, "oracle", oracle);
        json = vm.serializeAddress(obj, "projectXAdapter", adapter);
        json = vm.serializeAddress(obj, "hyperpoolVault", vault);
        json = vm.serializeAddress(obj, "liquidityVault", vault);
        json = vm.serializeAddress(obj, "airdrop", airdrop);
        json = vm.serializeAddress(obj, "referralRegistry", referral);
        json = vm.serializeAddress(obj, "tokenKHYPE", whype);
        json = vm.serializeAddress(obj, "tokenUSDC", usdc);
        json = vm.serializeAddress(obj, "projectXNpm", npm);
        json = vm.serializeAddress(obj, "projectXPool", ProjectXConstants.poolForChain(chainId));

        string memory path = string.concat("deployments/", vm.toString(chainId), ".json");
        vm.writeJson(json, path);
    }
}
