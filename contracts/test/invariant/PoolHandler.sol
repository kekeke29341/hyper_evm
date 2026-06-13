// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {FeeCollector} from "../../src/core/FeeCollector.sol";
import {ReferralRegistry} from "../../src/core/ReferralRegistry.sol";
import {PointsDistributor} from "../../src/core/PointsDistributor.sol";
import {ProjectXFactory} from "../../src/core/ProjectXFactory.sol";
import {ProjectXRouter} from "../../src/core/ProjectXRouter.sol";
import {ProjectXPair} from "../../src/core/ProjectXPair.sol";

/// @dev Randomized swap / mint / burn handler for invariant tests
contract PoolHandler is Test {
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    ProjectXRouter public router;
    ProjectXPair public pair;

    address[] public actors;
    bool public tokenAIsToken0;

    uint256 public ghostSwapCount;
    uint256 public ghostLastK;

    constructor() {
        FeeCollector feeCollector = new FeeCollector();
        ReferralRegistry referralRegistry = new ReferralRegistry();
        PointsDistributor pointsDistributor = new PointsDistributor(address(referralRegistry));
        ProjectXFactory factory = new ProjectXFactory(address(feeCollector), address(pointsDistributor), address(this));
        router = new ProjectXRouter(address(factory));
        factory.setTrustedRouter(address(router));

        tokenA = new MockERC20("kHYPE", "kHYPE", 18);
        tokenB = new MockERC20("USDC", "USDC", 6);
        factory.createPair(address(tokenA), address(tokenB));
        pair = ProjectXPair(factory.getPair(address(tokenA), address(tokenB)));
        pointsDistributor.authorizePool(address(pair));
        tokenAIsToken0 = pair.token0() == address(tokenA);

        for (uint256 i = 0; i < 3; i++) {
            address actor = makeAddr(string(abi.encodePacked("actor", i)));
            actors.push(actor);
            tokenA.mint(actor, 500 ether);
            tokenB.mint(actor, 500_000e6);
            vm.startPrank(actor);
            tokenA.approve(address(router), type(uint256).max);
            tokenB.approve(address(router), type(uint256).max);
            tokenA.approve(address(pair), type(uint256).max);
            tokenB.approve(address(pair), type(uint256).max);
            vm.stopPrank();
        }

        vm.startPrank(actors[0]);
        router.addLiquidity(address(tokenA), address(tokenB), 50 ether, 100_000e6, 0, 0, actors[0], block.timestamp + 1);
        vm.stopPrank();

        (uint256 r0, uint256 r1) = pair.getReserves();
        ghostLastK = r0 * r1;
    }

    function assertReservesMatchBalances() external view {
        (uint256 r0, uint256 r1) = pair.getReserves();
        assertEq(r0, tokenAIsToken0 ? tokenA.balanceOf(address(pair)) : tokenB.balanceOf(address(pair)));
        assertEq(r1, tokenAIsToken0 ? tokenB.balanceOf(address(pair)) : tokenA.balanceOf(address(pair)));
    }

    function swap(uint256 actorSeed, uint256 amountSeed, bool aToB) external {
        address actor = actors[bound(actorSeed, 0, actors.length - 1)];
        uint256 amountIn = bound(amountSeed, 1e15, 2 ether);

        address[] memory path = new address[](2);
        if (aToB) {
            path[0] = address(tokenA);
            path[1] = address(tokenB);
        } else {
            path[0] = address(tokenB);
            path[1] = address(tokenA);
        }

        vm.startPrank(actor);
        try router.swapExactTokensForTokens(amountIn, 0, path, actor, block.timestamp + 1) {
            ghostSwapCount++;
            (uint256 r0, uint256 r1) = pair.getReserves();
            ghostLastK = r0 * r1;
        } catch {}
        vm.stopPrank();
    }

    function addLiquidity(uint256 actorSeed, uint256 aSeed, uint256 bSeed) external {
        address actor = actors[bound(actorSeed, 0, actors.length - 1)];
        uint256 a = bound(aSeed, 1e16, 5 ether);
        uint256 b = bound(bSeed, 1e4, 50_000e6);

        vm.startPrank(actor);
        try router.addLiquidity(address(tokenA), address(tokenB), a, b, 0, 0, actor, block.timestamp + 1) {
            (uint256 r0, uint256 r1) = pair.getReserves();
            ghostLastK = r0 * r1;
        } catch {}
        vm.stopPrank();
    }

    function removeLiquidity(uint256 actorSeed, uint256 lpSeed) external {
        address actor = actors[bound(actorSeed, 0, actors.length - 1)];
        uint256 lp = pair.balanceOf(actor);
        if (lp < 1000) return;
        lp = bound(lpSeed, 1000, lp);

        vm.startPrank(actor);
        try router.removeLiquidity(address(tokenA), address(tokenB), lp, 0, 0, actor, block.timestamp + 1) {
            (uint256 r0, uint256 r1) = pair.getReserves();
            ghostLastK = r0 * r1;
        } catch {}
        vm.stopPrank();
    }
}
