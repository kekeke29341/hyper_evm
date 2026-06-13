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
import {PoolMath} from "../src/libraries/PoolMath.sol";

contract FuzzTest is Test {
    MockERC20 tokenA;
    MockERC20 tokenB;
    ProjectXRouter router;
    ProjectXPair pair;
    PointsDistributor pointsDistributor;
    MerkleAirdrop airdrop;
    bool tokenAIsToken0;

    address trader = makeAddr("trader");

    function setUp() public {
        FeeCollector feeCollector = new FeeCollector();
        ReferralRegistry referralRegistry = new ReferralRegistry();
        pointsDistributor = new PointsDistributor(address(referralRegistry));
        ProjectXFactory factory =
            new ProjectXFactory(address(feeCollector), address(pointsDistributor), address(this));
        router = new ProjectXRouter(address(factory));
        factory.setTrustedRouter(address(router));

        tokenA = new MockERC20("kHYPE", "kHYPE", 18);
        tokenB = new MockERC20("USDC", "USDC", 6);
        airdrop = new MerkleAirdrop(address(tokenB));

        factory.createPair(address(tokenA), address(tokenB));
        pair = ProjectXPair(factory.getPair(address(tokenA), address(tokenB)));
        pointsDistributor.authorizePool(address(pair));
        tokenAIsToken0 = pair.token0() == address(tokenA);

        tokenA.mint(trader, 1000 ether);
        tokenB.mint(trader, 1_000_000e6);
        tokenB.mint(address(this), 10_000_000e6);

        vm.startPrank(trader);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), 100 ether, 200_000e6, 0, 0, trader, block.timestamp + 1);
        vm.stopPrank();
    }

    function testFuzz_SwapRespectsK(uint256 amountSeed) public {
        uint256 amountIn = bound(amountSeed, 1e15, 5 ether);
        tokenA.mint(trader, amountIn);

        (uint256 r0, uint256 r1) = pair.getReserves();
        uint256 reserveIn = tokenAIsToken0 ? r0 : r1;
        uint256 reserveOut = tokenAIsToken0 ? r1 : r0;
        uint256 amountOut = PoolMath.getAmountOut(amountIn, reserveIn, reserveOut, PoolMath.SWAP_FEE_BPS);

        vm.startPrank(trader);
        tokenA.transfer(address(pair), amountIn);
        if (tokenAIsToken0) {
            pair.swap(0, amountOut, trader, trader, "");
        } else {
            pair.swap(amountOut, 0, trader, trader, "");
        }
        vm.stopPrank();

        (uint256 r0After, uint256 r1After) = pair.getReserves();
        assertGe(r0After * r1After, r0 * r1);
    }

    function testFuzz_PointsBoundedByDailyPool(uint256 feeSeed) public {
        uint256 fee = bound(feeSeed, 1, 1e20);
        vm.prank(address(pair));
        pointsDistributor.recordFeeContribution(address(pair), trader, fee);
        assertLe(pointsDistributor.getUserPoints(trader), pointsDistributor.DAILY_POOL());
    }

    function testFuzz_MerkleSingleClaim(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        address claimant = makeAddr("claimant");
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(claimant, amount))));
        airdrop.setMerkleRoot(leaf, block.timestamp + 7 days);
        tokenB.approve(address(airdrop), amount);
        airdrop.fund(amount);

        vm.prank(claimant);
        airdrop.claim(amount, new bytes32[](0));
        assertEq(tokenB.balanceOf(address(airdrop)), 0);
    }

    function testFuzz_MerkleTwoLeafClaims(uint256 amountA, uint256 amountB) public {
        amountA = bound(amountA, 1, 500_000e6);
        amountB = bound(amountB, 1, 500_000e6);
        address a = makeAddr("merkleA");
        address b = makeAddr("merkleB");
        bytes32 leafA = keccak256(bytes.concat(keccak256(abi.encode(a, amountA))));
        bytes32 leafB = keccak256(bytes.concat(keccak256(abi.encode(b, amountB))));
        bytes32 root = _pairRoot(leafA, leafB);
        uint256 total = amountA + amountB;

        airdrop.setMerkleRoot(root, block.timestamp + 7 days);
        tokenB.approve(address(airdrop), total);
        airdrop.fund(total);

        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = leafB;
        vm.prank(a);
        airdrop.claim(amountA, proofA);

        bytes32[] memory proofB = new bytes32[](1);
        proofB[0] = leafA;
        vm.prank(b);
        airdrop.claim(amountB, proofB);

        assertEq(tokenB.balanceOf(address(airdrop)), 0);
    }

    function _pairRoot(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }
}
