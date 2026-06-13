// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {FeeCollector} from "../src/core/FeeCollector.sol";
import {ReferralRegistry} from "../src/core/ReferralRegistry.sol";
import {PointsDistributor} from "../src/core/PointsDistributor.sol";
import {ProjectXFactory} from "../src/core/ProjectXFactory.sol";
import {ProjectXRouter} from "../src/core/ProjectXRouter.sol";
import {ProjectXPair} from "../src/core/ProjectXPair.sol";
import {MerkleAirdrop} from "../src/core/MerkleAirdrop.sol";

contract AccessControlTest is Test {
    FeeCollector feeCollector;
    ReferralRegistry referralRegistry;
    PointsDistributor pointsDistributor;
    ProjectXFactory factory;
    ProjectXRouter router;
    ProjectXPair pair;
    MerkleAirdrop airdrop;
    MockERC20 tokenA;
    MockERC20 tokenB;

    address stranger = makeAddr("stranger");

    function setUp() public {
        feeCollector = new FeeCollector();
        referralRegistry = new ReferralRegistry();
        pointsDistributor = new PointsDistributor(address(referralRegistry));
        factory = new ProjectXFactory(address(feeCollector), address(pointsDistributor), address(this));
        router = new ProjectXRouter(address(factory));
        factory.setTrustedRouter(address(router));
        tokenA = new MockERC20("A", "A", 18);
        tokenB = new MockERC20("B", "B", 6);
        airdrop = new MerkleAirdrop(address(tokenB));
        factory.createPair(address(tokenA), address(tokenB));
        pair = ProjectXPair(factory.getPair(address(tokenA), address(tokenB)));
        pointsDistributor.authorizePool(address(pair));
    }

    function test_Factory_RevertIdenticalTokens() public {
        vm.expectRevert("ProjectXFactory: IDENTICAL");
        factory.createPair(address(tokenA), address(tokenA));
    }

    function test_Factory_RevertZeroAddress() public {
        vm.expectRevert("ProjectXFactory: ZERO_ADDRESS");
        factory.createPair(address(0), address(tokenB));
    }

    function test_Factory_RevertPairExists() public {
        vm.expectRevert("ProjectXFactory: PAIR_EXISTS");
        factory.createPair(address(tokenA), address(tokenB));
    }

    function test_Factory_RevertNonOwnerSetter() public {
        vm.startPrank(stranger);
        vm.expectRevert("ProjectXFactory: FORBIDDEN");
        factory.setFeeCollector(makeAddr("fc"));
        vm.expectRevert("ProjectXFactory: FORBIDDEN");
        factory.setTrustedRouter(makeAddr("r"));
        vm.stopPrank();
    }

    function test_Pair_RevertInitializeTwice() public {
        vm.prank(stranger);
        vm.expectRevert("ProjectXPair: FORBIDDEN");
        pair.initialize(address(tokenA), address(tokenB), address(feeCollector), address(pointsDistributor));
    }

    function test_Pair_RevertSetConfigNonFactory() public {
        vm.prank(stranger);
        vm.expectRevert("ProjectXPair: FORBIDDEN");
        pair.setConfig(makeAddr("fc"), makeAddr("pd"));
    }

    function test_Merkle_RevertNonOwnerSetRoot() public {
        vm.prank(stranger);
        vm.expectRevert();
        airdrop.setMerkleRoot(bytes32(uint256(1)), block.timestamp + 1 days);
    }

    function test_Merkle_RevertNonOwnerFund() public {
        vm.prank(stranger);
        vm.expectRevert();
        airdrop.fund(1);
    }

    function test_Merkle_RevertInsufficientBalance() public {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(stranger, 100e6))));
        airdrop.setMerkleRoot(leaf, block.timestamp + 1 days);
        vm.prank(stranger);
        vm.expectRevert("MerkleAirdrop: INSUFFICIENT_BALANCE");
        airdrop.claim(100e6, new bytes32[](0));
    }

    function test_Points_RevertUnauthorizedPool() public {
        vm.prank(stranger);
        vm.expectRevert("PointsDistributor: UNAUTHORIZED");
        pointsDistributor.recordFeeContribution(address(pair), stranger, 1);
    }

    function test_Points_RevertPoolMismatch() public {
        vm.prank(address(pair));
        vm.expectRevert("PointsDistributor: POOL_MISMATCH");
        pointsDistributor.recordFeeContribution(makeAddr("other"), stranger, 1);
    }

    function test_Points_DeauthorizePool() public {
        pointsDistributor.deauthorizePool(address(pair));
        vm.prank(address(pair));
        vm.expectRevert("PointsDistributor: UNAUTHORIZED");
        pointsDistributor.recordFeeContribution(address(pair), stranger, 1);
    }
}
