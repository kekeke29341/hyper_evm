# スワップ付き rebalance Adapter への移行手順（HYPE建てプール）

## 背景

旧 `ProjectXAdapter.rebalance()` は、ポジションを解除して同じ残高のまま mint し直すだけで、スワップしない。
価格がレンジ（±5%）を抜けてポジションが片側 100% になると、新レンジでの mint の流動性が 0 になって revert する。
その結果、手数料ゼロのまま止まる（UPUMP/HYPE で 2026-09 下旬〜10-04 に発生）。

新 Adapter は、`swapRouter` が設定されていると rebalance 時に新レンジの比率までスワップしてから mint する。

| パラメータ | 既定 | 意味 |
|---|---|---|
| `swapRouter` | Deploy 時に Project X router `0x1EbD…Af9B` | `address(0)` なら旧動作（スワップなし） |
| `rebalanceSwapSlippageBps` | 100（1%） | スポット価格に対する minOut 許容幅。プール手数料 0.3% + 価格影響を含む。上限 1000 |
| 偏りの下限 | 0.1% | 偏りがこれ未満ならスワップしない |

スワップ後に mint しきれなかった残りは Vault に戻る。その分は、keeper が rebalance の直後に呼ぶ `deployIdle` で投入される。

## 移行が必要なプール

Vault は Adapter を `immutable` で持つため、Adapter だけの差し替えはできない。Vault・Adapter・Airdrop の一式を再デプロイする。

| key | 状態 |
|---|---|
| `upump-whype` | **2026-10-04 移行済み** |
| `ueth-whype` | 旧 Adapter |
| `ubtc-whype` | 旧 Adapter |

## 手順（例: `ubtc-whype`）

鍵は `.env.testnet` の `MAIN_PRIVATE_KEY`（運営 `0x0196…8cec` = 各 Vault の owner/keeper）。RPC は rate limit があるので、各 tx の間を空ける。

1. **外部ホルダーを確認する。** 旧 Vault の `totalSupply` と、`pools[key].cashdrop.vaultShareHolders` を確認する。運営と dead 以外の保有者がいれば、先に引出しを案内する（`pause` すると引出しもできなくなる）。
2. **運営シェアを引き出す。**
   `cast send <旧Vault> "withdraw(uint256,address)" <運営shares> <運営> --private-key $PK --rpc-url https://rpc.hyperliquid.xyz/evm`
3. **ガスを確保する。** デプロイに約 1,380 万ガス（0.1 gwei で約 0.0014 HYPE）かかる。足りなければ `WHYPE.withdraw(amount)` でネイティブ HYPE に戻す。big block が有効か（`eth_usingBigBlocks`）も確認する。
4. **シミュレーションしてから broadcast する。**

```bash
cd contracts
PRIVATE_KEY=$PK BASE_TOKEN=<base> POOL=<pool> TWAP_WINDOW=900 \
  forge script script/DeployHyperpoolPair.s.sol:DeployHyperpoolPair --rpc-url https://rpc.hyperliquid.xyz/evm
# 出力の adapterSwapRouter が 0x1EbD…Af9B であることを確認してから
PRIVATE_KEY=$PK BASE_TOKEN=<base> POOL=<pool> TWAP_WINDOW=900 \
  forge script script/DeployHyperpoolPair.s.sol:DeployHyperpoolPair --rpc-url https://rpc.hyperliquid.xyz/evm --broadcast --slow
```

5. **配線を確認する。** `adapter.vault/pool/swapRouter`、`vault.adapter/merkleAirdrop/swapRouter/twapWindow`、`airdrop.vaultShareToken`、`vault.ownerFeeWallet` を確認する。手数料の受取先が旧 Vault と同じかも見る。
6. **シードを入れる。** WHYPE を `approve` してから `depositUSDC(0.03e18, 運営)` を呼ぶ。その後、`positionTokenAmounts` で両方のトークンが入っていること、live tick がレンジ内にあることを確認する。
7. **keeper を 1 周回す。** `vault.rebalance(adapter.currentPoolPriceUsdc6PerHype18())` を実行し、NAV が変わっていないことを確認する。
8. **旧 Vault を止める。** `pause()` を呼び、`totalSupply` が dead の 1e15 だけになっていることを確認する。
9. **`999.json` を更新する。**

```bash
BASE_TOKEN=<base> POOL=<pool> TWAP_WINDOW=900 LABEL=<BASE>/HYPE \
  node scripts/finalize-deployment.mjs 999 hyperEVM_mainnet --pair <key>
node scripts/sync-abi.mjs
```

   Vault が変わると `cashdrop` はリセットされ、旧スタックは `pools[key].retiredStacks` に記録される。

10. **記録して反映する。** `contract-address-changelog.md` に追記し、main に push する（cron マシンが pull して新 Vault を対象にする）。その後、Vercel 本番（`hyper-evm`）にデプロイする。

## rebalance が失敗したとき

keeper は事前チェックで失敗を検知すると exit 3 で終了し、原因を表示する。

- **新 Adapter の場合:** スワップの価格影響が `rebalanceSwapSlippageBps` を超えた可能性が高い。プールの流動性を確認し、owner が `adapter.setRebalanceSwapSlippageBps(bps)`（最大 1000）で幅を広げてから再実行する。
- **旧 Adapter の場合:** 足りない側のトークンを少量 Adapter に送ってから再実行する（暫定対応）。恒久対策は、この手順での移行。

## テスト

- **ユニットテスト**: `forge test --match-path test/HypeQuotedVaultTest.t.sol`（片側からの回復、ルーター未設定時の従来動作、スリッページによる revert、権限）
- **Mainnet フォークテスト**: `forge test --match-path test/RebalanceSwapMainnetFork.t.sol -j 1 -vv`（実プールで上抜け・下抜けから再センタリングできること、NAV 損失 1% 未満）。公開 RPC の rate limit に当たるので、`-j 1` で直列に実行する。
