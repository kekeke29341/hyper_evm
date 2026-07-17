# セキュリティ修正レポート — 2026-07-05

対象: Hyperpool（HyperEVM chain 999 本番）コントラクト
修正項目: 精査レポートの #1・#3・#4・#5・#6
検証: `forge test`（fork以外の全10スイート **100 tests / 100 passed**、コンパイルエラー無し）

> 注記: #2（オーナー鍵の一点集中）はコードではなく運用（マルチシグ化・鍵分離）で対処すべき項目のため本修正の対象外です。最重要リスクとして別途対応を推奨します。

---

## #1 スポット価格操作によるシェア誤価格（最重要 / 無権限攻撃）

**問題:** NAV（`totalAssetsUsdc`）はLPポジションの構成比を `pool.slot0()`（スポット）で算出しつつ、評価には古い `refPrice` を使用。入金はNAVベース、出金は実流動性の比例配分（価格非依存）という非対称性があり、攻撃者がスポットを操作してNAVを歪め、割安にシェアを発行→比例配分で回収し他保有者を希薄化できた。入金・出金にオラクル乖離チェックが無かった。

**修正（`HyperpoolVault.sol`）:**
- NAV評価を**スポット価格に統一**（`currentPoolPriceUsdc6PerHype18()` を使用）。構成比と評価が同一価格になり value-conserving に。
- `depositUSDC` / `depositHYPE` の冒頭に `_enforceEntryPriceSane()` を追加。**プールのスポットがHyperCoreオラクルから `maxRebalanceDeviationBps`（既定5%）を超えて乖離している間は入金をrevert**。
- `depositHYPE` の入金評価も `refPrice` ではなくガード済みスポット価格を使用（M-1 も同時解消）。
- オラクル読取りは `_entryOraclePrice()` で `try/catch` 化し、**オラクル停止時は fail-open**（出金は価格非依存で常時可能なため安全側）。keeperリバランス側の厳格判定（`_oraclePriceUsdc6PerHype18`）は従来どおり維持。

**テスト（`SecurityFixesTest.t.sol`）:** スポットを上/下に大きく動かした入金が `ENTRY_PRICE_DEVIATION` でrevert、5%以内は通過、価格復帰後は再度成功、`depositHYPE` も同様にガードされることを確認。

## #3 リバランスのサンドイッチMEV

**問題:** `rebalance` が全流動性を `amount0Min/amount1Min = 0` で引き上げ・再ミント。keeper提示価格はオラクル照合されるが、実行時のプールスポットは無チェックでサンドイッチ可能だった。

**修正:**
- `HyperpoolVault.rebalance` に `_enforceEntryPriceSane()` を追加し、**実行時スポットもオラクル band 内であることを要求**（keeper価格照合 `_enforceOracleDeviation` に加えて）。
- `ProjectXAdapter` の `withdrawProRata` / `rebalance` の `decreaseLiquidity` に、現在のプール価格から算出した**スリッページ最小値**（`_decreaseMins` / `slippageBps`）を適用。プール未設定（モックNPM）時は `(0,0)` で従来挙動を維持。

**テスト:** スポット乖離時に `rebalance` が `ENTRY_PRICE_DEVIATION` でrevert、正常時は tick が更新されることを確認。

## #4 ハードコード・フォールバック価格 `$42/HYPE` の除去

**問題:** `totalAssetsUsdc` と `_swapHypeFeesToUsdc` が価格取得失敗時に `42e6 * 1e12`（$42固定）を使用。実勢乖離時に誤価格でNAV算定/手数料スワップが成立しうる。

**修正:** 両箇所の `$42` フォールバックを削除し、**価格が取得できない場合は `require(price > 0, "NO_PRICE")` でrevert**（fail-safe）。通常運用では `refPrice`（初期値 $42 シード）が常に非ゼロのため既存挙動に影響なし。

## #5 MerkleAirdrop 過払い / blast-radius

**検証結果:** コントラクトとオフチェーン（`daily-rewards.mjs`）を突き合わせた結果、**二重支払いのバグは無し**。配当は「期間ごとの増分」方式、繰越は「期限切れ＋未claim のみ」で `claimedByRoot` を確認済み（`daily-rewards.mjs:234-240`）、`distributionId` によるリプレイ防止・claim/distribute 間の同一ルート二重払い防止も機能している。

**追加ハードニング（防御多層化）:** `distributeRewards` に**1回あたりの支払い総額上限 `maxDistributionTotal`**（owner設定、既定は無制限）を追加。オペレータのミスや鍵侵害による一括ドレインの被害範囲を限定。運用では日次想定額の少し上に設定することを推奨。

**テスト:** 上限超過バッチのrevert、上限内バッチの成功、既にclaim済みでスキップされたアカウントは上限計算に含めないこと、非ownerが上限設定できないことを確認。

## #6 `ProjectXAdapter.recoverToken` の原資産ガード欠如

**問題:** アダプタの `recoverToken` が USDC/WHYPE を除外しておらず、NAV（`idleAssetsUsdc`）を裏付けるidle原資産をownerが引き出せた。NatSpec の「idleはNAVに含まれない」も誤記だった。

**修正:** `recoverToken` に `require(token != usdc && token != whype, "UNDERLYING")` を追加。原資産は `forwardIdleToVault()` で必ず保有者へ還元される旨に NatSpec を訂正。

**テスト:** ownerが原資産（USDC/WHYPE）をアダプタから回収しようとするとrevert、原資産はアダプタに残存、foreignトークンは引き続き回収可能でNAV/NPMポジションに影響しないことを確認。

---

## 検証コマンド

```
cd contracts && forge test --no-match-path "test/DepositFailureRootCause.t.sol"
# => 100 passed / 0 failed
```

`test/DepositFailureRootCause.t.sol` の `test_fixedMainnetVaultAcceptsDepositOnFork` は失敗しますが、これは**本修正と無関係**です。当該テストは live mainnet を fork してオンチェーンの既デプロイ bytecode を呼ぶもので、ローカル修正の影響を受けません。失敗理由はテストユーザ（`0xF352…`）のオンチェーンUSDC残高が現在 5359 単位しかなく、1,000,000 単位の入金に足りないため（環境依存）。

## 残存リスク / 推奨フォローアップ

- **#2 オーナー鍵の一点集中（最優先）**: owner をマルチシグ（Safe）へ移管、keeper/operator 鍵を分離。`maxDistributionTotal` の実効性も鍵分離が前提。
- **#1 のband運用**: 本番の `maxRebalanceDeviationBps` は入金・リバランス双方の許容乖離を兼ねる。狭すぎると正常入金がブロックされ、広すぎると保護が緩む。5%を起点に監視して調整。
- **M-3（pause中の出金）**: 本修正の対象外。pause中も出金を許可、または guardian/timelock 導入を別途検討。
