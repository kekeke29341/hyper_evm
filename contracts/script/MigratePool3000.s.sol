// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";

/// @title MigratePool3000 — deploy new adapter (fee=3000) + vault for 0.3% pool migration
/// @dev Vault.adapter and Adapter.fee are immutable — existing vault cannot switch fee tiers in-place.
///      Env: PRIVATE_KEY, OLD_VAULT (or read from deployments/999.json via broadcast)
///           SWITCH_AIRDROP (default true) — set false to leave MerkleAirdrop.vaultShareToken on the
///           old vault when the app keeps running on it until holders migrate.
///      Post-run: pause OLD_VAULT, users withdraw, redeposit to new vault; update deployment JSON.
contract MigratePool3000 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        require(chainId == HyperCoreConstants.CHAIN_ID_MAINNET, "MigratePool3000: mainnet only");

        address oldVault = vm.envAddress("OLD_VAULT");
        HyperpoolVault oldV = HyperpoolVault(oldVault);
        ProjectXAdapter oldAdapter = ProjectXAdapter(address(oldV.adapter()));

        address whype = address(oldV.tokenWHYPE());
        address usdc = address(oldV.tokenUSDC());
        address npm = ProjectXConstants.npmForChain(chainId);
        address pool = ProjectXConstants.poolForChain(chainId);
        require(npm != address(0) && pool != address(0), "MigratePool3000: NPM/pool not configured");

        address token0 = address(oldAdapter.token0());
        address token1 = address(oldAdapter.token1());

        vm.startBroadcast(deployerPrivateKey);

        address keeper = oldV.keeper();
        address operatorWallet = oldV.operatorWallet();
        address ownerFeeWallet = _ownerFeeWallet(oldVault, deployer);

        ProjectXAdapter newAdapter = new ProjectXAdapter(
            npm, token0, token1, usdc, whype, ProjectXConstants.FEE_TIER_DEFAULT, deployer
        );

        HyperpoolVault newVault = new HyperpoolVault(
            address(newAdapter),
            address(oldV.oracle()),
            oldV.hypeOracleAssetId(),
            whype,
            usdc,
            oldV.merkleAirdrop(),
            deployer,
            keeper,
            operatorWallet,
            ownerFeeWallet
        );

        newAdapter.setVault(address(newVault));
        newAdapter.setPool(pool);

        newVault.setSwapRouter(oldV.swapRouter());
        newVault.setFeeSplit(ProjectXConstants.OPERATIONS_FEE_BPS, ProjectXConstants.OWNER_FEE_BPS);
        newVault.setConvertHypeFeesToUsdc(oldV.convertHypeFeesToUsdc());
        newVault.setFeeSwapSlippageBps(oldV.feeSwapSlippageBps());
        newVault.setMaxRebalanceDeviationBps(oldV.maxRebalanceDeviationBps());

        if (vm.envOr("SWITCH_AIRDROP", true)) {
            MerkleAirdrop(oldV.merkleAirdrop()).setVaultShareToken(address(newVault));
        }

        vm.stopBroadcast();

        console2.log("=== Pool 0.3% migration deployed ===");
        console2.log("OLD_VAULT", oldVault);
        console2.log("OLD_ADAPTER", address(oldAdapter));
        console2.log("OLD_ADAPTER_FEE", oldAdapter.fee());
        console2.log("NEW_ADAPTER", address(newAdapter));
        console2.log("NEW_ADAPTER_FEE", newAdapter.fee());
        console2.log("NEW_VAULT", address(newVault));
        console2.log("POOL", pool);
        console2.log("Next: pause old vault, users withdraw, redeposit to new vault, keeper-rebalance on new vault");
    }

    function _ownerFeeWallet(address oldVault, address fallbackOwner) internal view returns (address wallet) {
        (bool ok, bytes memory data) =
            oldVault.staticcall(abi.encodeWithSignature("ownerFeeWallet()"));
        if (ok && data.length >= 32) {
            wallet = abi.decode(data, (address));
            if (wallet != address(0)) return wallet;
        }
        wallet = ProjectXConstants.OWNER_FEE_WALLET_MAINNET;
        if (wallet == address(0)) wallet = fallbackOwner;
    }
}
