// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HyperCoreConstants} from "../src/libraries/HyperCoreConstants.sol";
import {L1Read} from "../src/libraries/L1Read.sol";
import {MockL1PositionRead} from "../src/mocks/MockL1PositionRead.sol";
import {MockL1BlockRead} from "../src/mocks/MockL1BlockRead.sol";
import {MockOracleRead} from "../src/mocks/MockOracleRead.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {FeeCollector} from "../src/core/FeeCollector.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";
import {PointsDistributor} from "../src/core/PointsDistributor.sol";
import {ProjectXFactory} from "../src/core/ProjectXFactory.sol";
import {ProjectXRouter} from "../src/core/ProjectXRouter.sol";
import {ProjectXPair} from "../src/core/ProjectXPair.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";
import {HyperCoreOracle} from "../src/core/HyperCoreOracle.sol";
import {PoolMath} from "../src/libraries/PoolMath.sol";

contract ProjectXTest is Test {
    MockL1PositionRead mockPosition;
    MockL1BlockRead mockL1Block;
    MockOracleRead mockOracle;
    MockERC20 tokenA;
    MockERC20 tokenB;
    FeeCollector feeCollector;
    ReferralRegistry referralRegistry;
    PointsDistributor pointsDistributor;
    ProjectXFactory factory;
    ProjectXRouter router;
    MerkleAirdrop airdrop;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        _deployMocks();
        _deployCore();
        _seedLiquidity();
    }

    /// @dev Two mock strategies: vm.mockCall (default) or vm.etch (set USE_ETCH_MOCKS=true).
    function _deployMocks() internal {
        mockPosition = new MockL1PositionRead();
        mockL1Block = new MockL1BlockRead();
        mockOracle = new MockOracleRead();
        mockOracle.setPrice(1, 100e8);
        mockL1Block.setBlockNumber(42);

        if (vm.envOr("USE_ETCH_MOCKS", false)) {
            vm.etch(HyperCoreConstants.PRECOMPILE_POSITION, address(mockPosition).code);
            vm.etch(HyperCoreConstants.PRECOMPILE_L1_BLOCK, address(mockL1Block).code);
            vm.etch(HyperCoreConstants.PRECOMPILE_ORACLE_PX, address(mockOracle).code);
        } else {
            bytes memory emptyCalldata;
            vm.mockCall(HyperCoreConstants.PRECOMPILE_ORACLE_PX, abi.encode(uint32(1)), abi.encode(100e8));
            vm.mockCall(HyperCoreConstants.PRECOMPILE_L1_BLOCK, emptyCalldata, abi.encode(uint64(42)));
        }
    }

    function _deployCore() internal {
        feeCollector = new FeeCollector();
        referralRegistry = new ReferralRegistry();
        pointsDistributor = new PointsDistributor(address(referralRegistry));
        factory = new ProjectXFactory(address(feeCollector), address(pointsDistributor), address(this));
        router = new ProjectXRouter(address(factory));
        factory.setTrustedRouter(address(router));
        tokenA = new MockERC20("kHYPE", "kHYPE", 18);
        tokenB = new MockERC20("USDC", "USDC", 6);
        airdrop = new MerkleAirdrop(address(tokenB));
        factory.createPair(address(tokenA), address(tokenB));
        address pair = factory.getPair(address(tokenA), address(tokenB));
        pointsDistributor.authorizePool(pair);
    }

    function _seedLiquidity() internal {
        tokenA.mint(alice, 1000 ether);
        tokenB.mint(alice, 1_000_000e6);
        vm.startPrank(alice);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), 100 ether, 200_000e6, 0, 0, alice, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_MockPrecompiles() public view {
        assertEq(mockL1Block.l1BlockNumber(), 42);
        assertEq(L1Read.l1BlockNumber(), 42);
        assertEq(L1Read.oraclePx(1), 100e8);
    }

    function test_AddLiquidityAndSwap() public {
        tokenA.mint(bob, 10 ether);
        vm.startPrank(bob);
        tokenA.approve(address(router), type(uint256).max);
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        uint256[] memory amounts = router.swapExactTokensForTokens(1 ether, 0, path, bob, block.timestamp + 1);
        assertGt(amounts[1], 0);
        uint256 epoch = pointsDistributor.currentEpoch();
        assertGt(pointsDistributor.previewEpochPoints(epoch, bob), 0);
        vm.warp(block.timestamp + pointsDistributor.EPOCH_DURATION() + 1);
        pointsDistributor.claimEpochPoints(epoch);
        assertGt(pointsDistributor.getUserPoints(bob), 0);
        vm.stopPrank();
    }

    function test_ReferralBoost() public {
        bytes32 code = keccak256("XM79B4");
        vm.prank(alice);
        referralRegistry.registerCode(code);
        vm.prank(bob);
        referralRegistry.enterInvitationCode(code);

        tokenA.mint(bob, 5 ether);
        vm.startPrank(bob);
        tokenA.approve(address(router), type(uint256).max);
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        router.swapExactTokensForTokens(1 ether, 0, path, bob, block.timestamp + 1);
        vm.stopPrank();

        uint256 epoch = pointsDistributor.currentEpoch();
        vm.warp(block.timestamp + pointsDistributor.EPOCH_DURATION() + 1);
        vm.prank(bob);
        pointsDistributor.claimEpochPoints(epoch);
        vm.prank(alice);
        pointsDistributor.claimEpochPoints(epoch);

        assertGt(pointsDistributor.getUserPoints(bob), 0);
        assertGt(pointsDistributor.getUserPoints(alice), 0);
    }

    function test_SwapGasUnderSmallBlock() public {
        tokenA.mint(bob, 2 ether);
        vm.startPrank(bob);
        tokenA.approve(address(router), type(uint256).max);
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        uint256 gasBefore = gasleft();
        router.swapExactTokensForTokens(0.5 ether, 0, path, bob, block.timestamp + 1);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();
        assertLt(gasUsed, HyperCoreConstants.SMALL_BLOCK_GAS_LIMIT, "swap must fit small block (3M gas)");
    }

    function test_UserPointsPersistAfterSwap() public {
        tokenA.mint(bob, 2 ether);
        vm.startPrank(bob);
        tokenA.approve(address(router), type(uint256).max);
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        router.swapExactTokensForTokens(1 ether, 0, path, bob, block.timestamp + 1);
        vm.stopPrank();

        uint256 epoch = pointsDistributor.currentEpoch();
        vm.warp(block.timestamp + pointsDistributor.EPOCH_DURATION() + 1);
        vm.prank(bob);
        pointsDistributor.claimEpochPoints(epoch);

        uint256 bobPoints = pointsDistributor.getUserPoints(bob);
        assertGt(bobPoints, 0);
        assertEq(pointsDistributor.getUserPoints(bob), bobPoints);
    }

    function test_CreatePairRestrictedToAdmin() public {
        vm.prank(bob);
        vm.expectRevert("ProjectXFactory: FORBIDDEN");
        factory.createPair(address(tokenA), address(tokenB));
    }

    function test_SyncPairsUpdatesConfig() public {
        FeeCollector newCollector = new FeeCollector();
        factory.setFeeCollector(address(newCollector));
        factory.syncPairs(0, factory.allPairsLength());
        address pair = factory.getPair(address(tokenA), address(tokenB));
        assertEq(ProjectXPair(pair).feeCollector(), address(newCollector));
    }

    function test_ReferralEmptyCodeRejected() public {
        vm.prank(alice);
        vm.expectRevert("ReferralRegistry: EMPTY_CODE");
        referralRegistry.registerCode(bytes32(0));
    }

    function test_HyperCoreOracleMock() public {
        assertEq(L1Read.l1BlockNumber(), 42);
        assertEq(L1Read.oraclePx(1), 100e8);

        HyperCoreOracle oracle = new HyperCoreOracle();
        assertEq(oracle.getL1BlockNumber(), 42);
        assertEq(oracle.getOraclePrice(1), 100e8);
    }

    function testFork_HyperEVMTestnet() public {
        if (!vm.envOr("FORK_TEST", false)) return;
        vm.createSelectFork("hyperEVM_testnet");
        assertEq(block.chainid, HyperCoreConstants.CHAIN_ID_TESTNET);
        uint64 l1Block = L1Read.l1BlockNumber();
        assertGt(l1Block, 0);
    }
}

contract PoolMathTest is Test {
    function test_GetAmountOut() public pure {
        uint256 out = PoolMath.getAmountOut(1 ether, 100 ether, 200_000e6, 30);
        assertGt(out, 0);
    }
}
