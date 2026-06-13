// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FeeCollector} from "../src/core/FeeCollector.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";
import {PointsDistributor} from "../src/core/PointsDistributor.sol";
import {ProjectXFactory} from "../src/core/ProjectXFactory.sol";
import {ProjectXRouter} from "../src/core/ProjectXRouter.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreOracle} from "../src/core/HyperCoreOracle.sol";
import {HyperpoolLiquidityVault} from "../src/core/HyperpoolLiquidityVault.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";

/// @title DeployProjectX — staged deploy for HyperEVM dual-block architecture
/// @dev BEFORE deploying: {"type":"evmUserModify","usingBigBlocks": true}
///      Use `bigBlockGasPrice` for gas estimation. See contracts/README.md.
contract DeployProjectX is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;

        require(
            chainId == HyperCoreConstants.CHAIN_ID_TESTNET || chainId == HyperCoreConstants.CHAIN_ID_MAINNET,
            "DeployProjectX: wrong chain"
        );

        address khype = HyperCoreConstants.khypeForChain(chainId);
        address usdc = HyperCoreConstants.usdcForChain(chainId);

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: infrastructure
        FeeCollector feeCollector = new FeeCollector();
        ReferralRegistry referralRegistry = new ReferralRegistry();
        PointsDistributor pointsDistributor = new PointsDistributor(address(referralRegistry));
        HyperCoreOracle oracle = new HyperCoreOracle();

        // Step 2: AMM
        ProjectXFactory factory =
            new ProjectXFactory(address(feeCollector), address(pointsDistributor), deployer);
        ProjectXRouter router = new ProjectXRouter(address(factory));
        factory.setTrustedRouter(address(router));

        // Step 3: airdrop + pool
        MerkleAirdrop airdrop = new MerkleAirdrop(usdc);
        factory.createPair(khype, usdc);
        address pair = factory.getPair(khype, usdc);
        pointsDistributor.authorizePool(pair);
        HyperpoolLiquidityVault liquidityVault =
            new HyperpoolLiquidityVault(address(router), pair, khype, usdc, deployer, deployer);

        // Step 4 (optional): seed liquidity if deployer holds tokens
        if (vm.envOr("SEED_LIQUIDITY", false)) {
            uint256 khypeAmt = vm.envOr("SEED_KHYPE", uint256(100 ether));
            uint256 usdcAmt = vm.envOr("SEED_USDC", uint256(200_000e6));
            _seedLiquidity(router, khype, usdc, khypeAmt, usdcAmt, deployer);
        }

        vm.stopBroadcast();

        console2.log("Chain", chainId);
        console2.log("HyperCoreOracle", address(oracle));
        console2.log("Factory", address(factory));
        console2.log("Router", address(router));
        console2.log("Pair", pair);
        console2.log("LiquidityVault", address(liquidityVault));
        console2.log("kHYPE/WHYPE", khype);
        console2.log("USDC", usdc);

        _writeDeployment(
            chainId,
            address(feeCollector),
            address(referralRegistry),
            address(pointsDistributor),
            address(oracle),
            address(factory),
            address(router),
            address(airdrop),
            pair,
            address(liquidityVault),
            khype,
            usdc
        );
    }

    function _seedLiquidity(
        ProjectXRouter router,
        address khype,
        address usdc,
        uint256 khypeAmt,
        uint256 usdcAmt,
        address deployer
    ) internal {
        IERC20Minimal(khype).approve(address(router), khypeAmt);
        IERC20Minimal(usdc).approve(address(router), usdcAmt);
        router.addLiquidity(khype, usdc, khypeAmt, usdcAmt, 0, 0, deployer, block.timestamp + 3600);
    }

    function _writeDeployment(
        uint256 chainId,
        address feeCollector,
        address referralRegistry,
        address pointsDistributor,
        address oracle,
        address factory,
        address router,
        address airdrop,
        address pair,
        address liquidityVault,
        address khype,
        address usdc
    ) internal {
        string memory obj = "deployment";
        string memory json = vm.serializeUint(obj, "chainId", chainId);
        json = vm.serializeBool(obj, "deployed", true);
        json = vm.serializeAddress(obj, "feeCollector", feeCollector);
        json = vm.serializeAddress(obj, "referralRegistry", referralRegistry);
        json = vm.serializeAddress(obj, "pointsDistributor", pointsDistributor);
        json = vm.serializeAddress(obj, "oracle", oracle);
        json = vm.serializeAddress(obj, "factory", factory);
        json = vm.serializeAddress(obj, "router", router);
        json = vm.serializeAddress(obj, "airdrop", airdrop);
        json = vm.serializeAddress(obj, "pair", pair);
        json = vm.serializeAddress(obj, "liquidityVault", liquidityVault);
        json = vm.serializeAddress(obj, "tokenKHYPE", khype);
        json = vm.serializeAddress(obj, "tokenUSDC", usdc);

        string memory path = string.concat("deployments/", vm.toString(chainId), ".json");
        vm.writeJson(json, path);
    }
}

interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
}
