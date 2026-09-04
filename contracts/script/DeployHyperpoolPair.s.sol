// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {ProjectXAdapter} from "../src/core/ProjectXAdapter.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";
import {ProjectXConstants} from "../src/libraries/ProjectXConstants.sol";

/// @title DeployHyperpoolPair — deploy one managed-LP vault for a HYPE-quoted pair (UPUMP/UBTC/UETH)
/// @dev Numeraire-agnostic sibling of DeployHyperpool. Deploys a dedicated Adapter + Vault +
///      MerkleAirdrop(rewardToken) per pair and wires the ±5% range and pool-TWAP entry guard. It
///      NEVER touches the live HYPE/USDC vault, its adapter, airdrop, or the top-level deployment JSON.
///      Reuses the shared NPM and SwapRouter. The HyperCore oracle is meaningless for HYPE-quoted
///      pools, so the vault is deployed with the oracle unset and relies on the TWAP guard.
///
///  Required env:
///    PRIVATE_KEY        deployer key
///    BASE_TOKEN         priced asset (e.g. UPUMP / UBTC / UETH)
///    POOL               Project X pool for QUOTE_TOKEN/BASE_TOKEN at FEE
///  Optional env (defaults in parens):
///    QUOTE_TOKEN        numeraire (WHYPE 0x5555…5555)
///    FEE                fee tier (3000)
///    INITIAL_REF_PRICE  quote-per-base * 1e18 seed; 0 → placeholder overwritten on first deposit (0)
///    UPPER_RANGE_BPS    (500)      LOWER_RANGE_BPS (500)
///    TWAP_WINDOW        seconds (900);  TWAP_REQUIRED (false — grow cardinality first, then enable)
///    OBS_CARDINALITY    if >1, calls increaseObservationCardinalityNext(next) on the pool (0 = skip)
///    OWNER_FEE_WALLET   protocol fee recipient (mainnet default)
contract DeployHyperpoolPair is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        require(
            chainId == HyperCoreConstants.CHAIN_ID_TESTNET || chainId == HyperCoreConstants.CHAIN_ID_MAINNET,
            "DeployHyperpoolPair: wrong chain"
        );

        address baseToken = vm.envAddress("BASE_TOKEN");
        address pool = vm.envAddress("POOL");
        address quoteToken = vm.envOr("QUOTE_TOKEN", HyperCoreConstants.WHYPE);
        uint24 fee = uint24(vm.envOr("FEE", uint256(ProjectXConstants.FEE_TIER_DEFAULT)));
        uint256 initialRefPrice = vm.envOr("INITIAL_REF_PRICE", uint256(0));
        uint256 upperBps = vm.envOr("UPPER_RANGE_BPS", uint256(500));
        uint256 lowerBps = vm.envOr("LOWER_RANGE_BPS", uint256(500));
        uint32 twapWindow = uint32(vm.envOr("TWAP_WINDOW", uint256(900)));
        bool twapRequired = vm.envOr("TWAP_REQUIRED", false);
        uint16 obsCardinality = uint16(vm.envOr("OBS_CARDINALITY", uint256(0)));
        address rewardToken = vm.envOr("REWARD_TOKEN", quoteToken); // Cashdrop in the quote token (WHYPE)

        require(baseToken != address(0) && pool != address(0), "DeployHyperpoolPair: BASE/POOL required");
        require(baseToken != quoteToken, "DeployHyperpoolPair: BASE==QUOTE");

        address npm = ProjectXConstants.npmForChain(chainId);
        address swapRouter = ProjectXConstants.swapRouterForChain(chainId);
        require(npm != address(0), "DeployHyperpoolPair: NPM not configured");

        address token0 = baseToken < quoteToken ? baseToken : quoteToken;
        address token1 = baseToken < quoteToken ? quoteToken : baseToken;

        address ownerFeeWallet = vm.envOr(
            "OWNER_FEE_WALLET",
            chainId == HyperCoreConstants.CHAIN_ID_MAINNET ? ProjectXConstants.OWNER_FEE_WALLET_MAINNET : deployer
        );

        // If no seed price supplied, use a benign non-zero placeholder — the adapter overwrites
        // refPrice from the live pool on the first deposit (pool is set below).
        uint256 seedRefPrice = initialRefPrice == 0 ? 1e18 : initialRefPrice;

        vm.startBroadcast(deployerPrivateKey);

        MerkleAirdrop airdrop = new MerkleAirdrop(rewardToken);

        ProjectXAdapter adapter =
            new ProjectXAdapter(npm, token0, token1, quoteToken, baseToken, fee, seedRefPrice, deployer);

        // Oracle unset (address(0)): HYPE-quoted pools have no meaningful HYPE/USD oracle; the pool
        // TWAP guard provides entry protection instead.
        HyperpoolVault vault = new HyperpoolVault(
            address(adapter),
            address(0),
            0,
            baseToken, // legacy `tokenWHYPE` slot = base
            quoteToken, // legacy `tokenUSDC` slot = quote
            address(airdrop),
            deployer,
            deployer,
            deployer,
            ownerFeeWallet
        );

        adapter.setVault(address(vault));
        adapter.setPool(pool);
        adapter.setRangeBps(upperBps, lowerBps);

        airdrop.setVaultShareToken(address(vault));

        if (swapRouter != address(0)) {
            vault.setSwapRouter(swapRouter);
        }

        // Entry guard: pool TWAP. Grow cardinality first if requested, then arm the window.
        if (obsCardinality > 1) {
            vault.increasePoolObservationCardinality(obsCardinality);
        }
        vault.setTwapWindow(twapWindow);
        vault.setTwapRequired(twapRequired);

        vm.stopBroadcast();

        console2.log("=== HYPE-quoted pair deployed ===");
        console2.log("Chain", chainId);
        console2.log("BASE_TOKEN", baseToken);
        console2.log("BASE_SYMBOL", IERC20Metadata(baseToken).symbol());
        console2.log("BASE_DECIMALS", IERC20Metadata(baseToken).decimals());
        console2.log("QUOTE_TOKEN", quoteToken);
        console2.log("QUOTE_DECIMALS", IERC20Metadata(quoteToken).decimals());
        console2.log("POOL", pool);
        console2.log("FEE", fee);
        console2.log("priceDiv", adapter.priceDiv());
        console2.log("ProjectXAdapter", address(adapter));
        console2.log("HyperpoolVault", address(vault));
        console2.log("MerkleAirdrop", address(airdrop));
        console2.log("REWARD_TOKEN", rewardToken);
        console2.log("upperRangeBps", upperBps);
        console2.log("lowerRangeBps", lowerBps);
        console2.log("twapWindow", twapWindow);
        console2.log("twapRequired", twapRequired);
        // Cross-check: derived live pool price (quote-per-base * 1e18) for sanity vs INITIAL_REF_PRICE.
        console2.log("livePoolPriceQuotePerBase18", adapter.currentPoolPriceQuotePerBase18());
        console2.log(
            "Next: fund small operator seed, keeper deployIdle + rebalance once, confirm ticks/NAV, then open deposits."
        );
        console2.log("Then: merge into deployments/", vm.toString(chainId));
        console2.log("  .json pools[] via scripts/finalize-deployment.mjs --pair <key> (never overwrite top-level).");
    }
}
