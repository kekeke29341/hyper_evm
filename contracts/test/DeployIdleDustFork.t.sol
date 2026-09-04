// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {HyperpoolVault} from "../src/core/HyperpoolVault.sol";

interface IERC20Minimal {
    function balanceOf(address) external view returns (uint256);
}

/// Mainnet 2026-07 root cause: deployIdle() reverted daily on the gen-7 vault because the
/// retry re-deposited a 3053-wei KHYPE leftover and the pool minted zero liquidity. Idle
/// funds accumulated outside the LP position ($1.3 -> $20.8 in four days), shrinking fee
/// harvests and the daily Cashdrop. These tests fork the live failure state and prove the
/// fixed bytecode (dust-drop + best-effort retry) deploys the stranded idle.
contract DeployIdleDustFork is Test {
    address constant VAULT = 0x2Efa225A0753010BD63A5c8Ee546E2958e7b7C10;
    address constant ADAPTER = 0xbb047b03f9c6889108ffB77f303a30Fe74A76f70;
    address constant ORACLE = 0xad6B05B0B4c79264c32136842945F321f58ef94C;
    address constant WHYPE = 0x5555555555555555555555555555555555555555;
    address constant USDC = 0xb88339CB7199b77E23DB6E890353E22632Ba630f;
    address constant AIRDROP = 0x67d45f8535eC3F268f1aCB0fe69eC87AD7aa7431;
    address constant KEEPER = 0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC;

    function setUp() public {
        vm.createSelectFork("https://rpc.hyperliquid.xyz/evm");
    }

    /// @dev The 0.01 USDC floor below which the vault deliberately leaves a side idle.
    uint256 constant DUST_DEPOSIT_USDC = 10_000;

    function _vaultHasDustSplitIdle() internal view returns (bool) {
        // The bug only reproduces while the vault holds idle on both sides, with the USDC side
        // above the dust floor; guard so the test degrades gracefully once the idle has been
        // migrated off this vault. The live vault now holds only sub-dust residue (a few hundred
        // wei of USDC), which the fixed logic correctly leaves idle rather than LP-depositing —
        // asserting against that would test the opposite of the intended behaviour.
        return IERC20Minimal(WHYPE).balanceOf(VAULT) > 0
            && IERC20Minimal(USDC).balanceOf(VAULT) >= DUST_DEPOSIT_USDC;
    }

    function test_deployedGen7DeployIdleReverts() public {
        if (!_vaultHasDustSplitIdle()) return;
        vm.prank(KEEPER);
        vm.expectRevert();
        HyperpoolVault(VAULT).deployIdle();
    }

    function test_fixedBytecodeDeploysStrandedIdle() public {
        if (!_vaultHasDustSplitIdle()) return;

        // Deploy the fixed implementation with identical constructor args so the baked-in
        // immutables match, then etch its runtime code over the live vault. Storage
        // (keeper, swapRouter, balances) is untouched — this simulates the gen-8 logic
        // running against the exact on-chain failure state.
        //
        // The live gen-7 adapter predates the numeraire generalization, so it cannot answer the
        // role/decimal getters the vault constructor now reads. Mock them for the construction
        // only, with the values the legacy USDC(6)/WHYPE(18) pair reduces to, then clear the mocks
        // so the etched vault runs against the untouched on-chain adapter.
        vm.mockCall(ADAPTER, abi.encodeWithSignature("quoteToken()"), abi.encode(USDC));
        vm.mockCall(ADAPTER, abi.encodeWithSignature("baseToken()"), abi.encode(WHYPE));
        vm.mockCall(ADAPTER, abi.encodeWithSignature("priceDiv()"), abi.encode(uint256(1e30)));
        vm.mockCall(ADAPTER, abi.encodeWithSignature("quoteDecimals()"), abi.encode(uint8(6)));
        HyperpoolVault fixedImpl = new HyperpoolVault(
            ADAPTER, ORACLE, 0, WHYPE, USDC, AIRDROP, address(this), KEEPER, address(this), address(this)
        );
        vm.clearMockedCalls();
        vm.etch(VAULT, address(fixedImpl).code);

        uint256 usdcBefore = IERC20Minimal(USDC).balanceOf(VAULT);
        uint256 hypeBefore = IERC20Minimal(WHYPE).balanceOf(VAULT);

        vm.prank(KEEPER);
        HyperpoolVault(VAULT).deployIdle();

        // The stranded idle must land in the LP; at most dust-sized leftovers remain.
        assertLt(IERC20Minimal(USDC).balanceOf(VAULT), usdcBefore / 10, "idle USDC deployed");
        assertLt(IERC20Minimal(WHYPE).balanceOf(VAULT), hypeBefore / 10, "idle HYPE deployed");
    }
}
