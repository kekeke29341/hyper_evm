# セキュリティ再々レビュー(第2パス)& 修正案 — 2026-06-15

対象: コントラクト全体 + 新規 `HyperpoolLiquidityVault` + 運用スクリプト + CI + テスト。
前提: 前回レビュー(`docs/security-review-2026-06-12.md`)の指摘がコードに反映済み。本パスは **(1) その修正が正しいかの裏取り**、**(2) 修正によって新たに混入したバグの発見**、**(3) 新規コードの監査** に焦点を当てる。全 Critical/High はソースで直接確認済み。

> **結論(TL;DR)**: 前回の P0/P1(資金ロック・K チェック・origin 偽装・claim 無効化・エアドロ回収・gitignore 等)は**正しく修正されている**。テストも 28→**67 件**に増え、invariant/fuzz も導入された(大きな前進)。
> **2026-06-15 追記**: N-1 / N-2 / N-3 はコードで対応済み（`PointsDistributor` エポック確定後 claim、`HyperpoolLiquidityVault` dead shares、`deploy-key-guard.sh` 導出アドレス照合）。N-4 CSP は未着手。メインネット前は再デプロイ + 第三者監査が必要。

---

## A. 前回指摘の修正状況(裏取り済み)

| 旧ID | 内容 | 状態 | 確認箇所 |
|------|------|------|----------|
| C-1 | `burn()` の二重 burn で LP 資金ロック | ✅ 解消 | `ProjectXPair.sol:117-134`。`_mintFee`/`kLast` 機構を**全廃**し burn は素直な比例償還に |
| H-1 | K 不変量が手数料を強制せず LP 手数料バイパス可 | ✅ 修正 | `ProjectXPair.sol:159-164`。fee 調整済み残高 + `Math.mulDiv` でオーバーフロー回避(旧 L-3 も同時解消)。プロトコル 4.2bps 控除後も実 K ≥ 旧 K を数式確認済み |
| H-2 | `swap` の `origin` 偽装でポイント付替 | ✅ 修正 | `ProjectXPair.sol:166-167` で `msg.sender == trustedRouter` のときのみ記録。Factory に `trustedRouter`/`setTrustedRouter` 追加 |
| H-3 | `claimDailyRewards` が無支払いで残高ゼロ化 | ✅ 解消 | 関数を**削除**。`userPoints` はオフチェーン集計用台帳と明記(`PointsDistributor.sol:8`) |
| M-1/M-2 | `_mintFee` 順序バグ / 二重徴収 | ✅ 解消 | `_mintFee`/`kLast` 全廃で直接 14% 徴収に一本化 |
| M-3 | エアドロ未請求分の永久ロック | ✅ 修正 | `MerkleAirdrop.recoverUnclaimed`(`:65-69`)、期限ゲート維持 |
| M-5 | Oracle のゼロ価格/鮮度未検証 | ✅ 修正 | `HyperCoreOracle.sol:19,39` に `require(price != 0)`、デシマル/`l1Block` 鮮度を doc 化 |
| M-9 | フロント流動性操作が `amountMin=0` | ✅ 修正 | `useDeFi.ts:212-213,261-262` ほかでスリッページから min を算出 |
| M-10 | CSP なし | ✅ 修正 | `vercel.json` に CSP 追加(下記 N-4 で残課題あり) |
| L-1 | `removeLiquidity` の pair チェック欠落 | ✅ 修正 | `ProjectXRouter.sol:54,57`(min チェックも追加) |
| L-4 | エポック前進が単段 / 寄与がリセットされない | ✅ 修正 | `PointsDistributor.sol:88-94` を `while`+`epochStart += DURATION`、寄与を `mapping(epoch=>mapping(addr=>uint))` 化 |
| L-5 | Merkle の `claimed` がルート跨ぎで残る / pause なし | ✅ 修正 | `claimedByRoot[root][addr]`(`:18,46,51`)+ `Pausable`(`:11,35-43`) |
| L-6 | 相互リファラル可 | ✅ 修正 | `ReferralRegistry.sol:36` に `MUTUAL_REFERRAL` チェック |
| M-6 | `!/broadcast` の gitignore 上書き | ✅ 修正 | `git check-ignore` で 998 broadcast が **IGNORED** を確認。`contracts/.gitignore` の否定行削除済み |
| M-8 | デプロイ鍵ガードなし | ⚠️ 部分対応 | `scripts/deploy-key-guard.sh` 追加。ただし**ブロックリストが壊れている**(→ N-3) |

**良好:** PoolMath は標準 UniV2 式(`getAmountOut`/`quote`/`sqrt`)で問題なし。Vault は `forceApprove(0)→forceApprove(amount)` で非標準 ERC20 に対応、CEI 順序で `_burn` を外部呼び出し前に実行、全 external 関数に `nonReentrant`。

---

## B. 新規・残存の指摘

### 🔴 N-1(High・新規バグ): エポック最初の dust スワップで DAILY_POOL を丸取りできる
**場所:** `contracts/src/core/PointsDistributor.sol:52-63`

旧 M-4(按分未実装)を「インクリメンタル按分」で修正した結果、**早い寄与者の取り分が後で減らない**ため上限が機能していない。

```solidity
uint256 oldTotal = epochTotalFees[epoch];          // エポック最初なら 0
uint256 newTotal = oldTotal + feeAmount;
uint256 oldPoints = oldTotal > 0 ? (oldContrib * DAILY_POOL) / oldTotal : 0;   // = 0
uint256 newPoints = newTotal > 0 ? (newContrib * DAILY_POOL) / newTotal : 0;   // = feeAmount*POOL/feeAmount = POOL
uint256 basePoints = newPoints - oldPoints;        // = DAILY_POOL(=1,000,000 ether)
```

エポックの**最初の寄与者**は `newContrib == newTotal` なので、手数料が 1 wei でも `basePoints = DAILY_POOL` を獲得する。

**攻撃シナリオ:** 攻撃者は各エポック(1 日)の冒頭に、公式 Router 経由で約 334 wei の入力(= 1 wei 手数料)の極小スワップを 1 回実行するだけで、**100 万ポイント/日**を獲得する(リファラルブースト込みでさらに増加)。ポイントはエアドロップ配分の根拠なので、リーダーボードを実質コストゼロで支配できる。さらに、複数ユーザーが寄与すると各自の取り分が重複計上され、**1 エポックの発行総量が DAILY_POOL を超過**する(上限が存在しない)。

**なぜテストで見つからないか:** `FuzzTest.t.sol:80` は単一トレーダーで `getUserPoints <= DAILY_POOL` を assert している。単一寄与者は常にちょうど DAILY_POOL を得る(=バグそのもの)ので `<=` は通ってしまい、**バグを正常仕様として固定化している**。複数ユーザーの合計超過や first-mover の検証がない。

**修正案:** 部分合計からシェアを計算してはいけない。いずれかを採用:
1. **(推奨)** 寄与時点では `epochFeeContribution[epoch][user]` と `epochTotalFees[epoch]` の記録のみ行い、ポイント按分は**エポック確定後の最終 total**で計算する(オフチェーン集計、または「閉じたエポックに対する claim」で `contrib/total*POOL` を遅延付与)。これが上限を厳密に守れる唯一の方法。
2. 正規化をやめ、`basePoints = feeAmount`(またはスケール済み)を素直に加算する。上限はオフチェーン表示概念に格下げ。first-mover 悪用は消える。

対応テスト: `test_FirstContributorCannotDrainPool`(最初に 1 wei 手数料 → 付与が DAILY_POOL になってしまうことを実証)、`invariant_EpochPointsNeverExceedPool`(1 エポックの全ユーザー base ポイント合計 ≤ DAILY_POOL)。

### 🟠 N-2(Medium・新規コード): `HyperpoolLiquidityVault` に first-depositor / 寄付インフレ耐性がない
**場所:** `contracts/src/core/HyperpoolLiquidityVault.sol:256-265`(`_mintSharesFromLp`)、`:179-181`(`withdraw`)

Vault シェアには pair 側のような `MINIMUM_LIQUIDITY`(dead share)も仮想オフセットもない。初回入金は `supply==0` で `shares = lpGained`。攻撃者が「極小初回入金 → LP トークンを Vault へ直接 donate して `totalManagedLp` を釣り上げ」を行うと、後続入金者の `shares = lpGained * supply / lpBefore` が切り捨てで目減りする。

- `require(shares > 0)`(`:263`)があるため**入金額がシェア 0 に丸められる場合はリバート**し、被害者の資金消失(古典的窃取)は防がれている。残存リスクは **(a) グリーフィング DoS**(攻撃者が X LP を donate すると、以後の入金者は X 以上を入れないとリバート)と **(b) 端数によるシェア価値の precision loss**。
- 攻撃者は donate 分を自己負担するため直接窃取は難しいが、money-handling Vault としては標準対策を欠く。

**修正案:** 初回入金時に少量の dead share を `address(0xdEaD)` 等へ mint してロックする(pair と同様)か、OZ ERC4626 の virtual-shares/virtual-assets オフセットを導入する。`previewSharesForLiquidity` も同じ規約に合わせる。

### 🟠 N-3(Medium・運用): `deploy-key-guard.sh` のブロックリストが壊れており、主要な Anvil 鍵を弾けない
**場所:** `scripts/deploy-key-guard.sh`(`KNOWN_DEV_KEYS`)

比較は 64 桁 hex の `KEY_FULL` との完全一致だが、リスト中の複数エントリが**秘密鍵として不正な長さ**で、実鍵に決して一致しない(`node` で長さ実測済み):

| エントリ先頭 | 桁数 | 判定 |
|---|---|---|
| `0xac0974…ff80` | 60 hex | **切り詰め**。本物の Anvil #0 鍵(64 hex)に一致せず弾けない |
| `0x59c6995e…95e1` | 40 hex | これは**アドレス長**であって秘密鍵ではない |
| `0x7c852118…d755` | 65 hex | 奇数桁で不正 |

最も誤用されやすい Anvil/Hardhat 鍵 #0(`scripts/dev-local.sh` が `export` するもの)が**ガードをすり抜ける**ため、「公開鍵が周知のアドレスを owner にしてメインネットへデプロイ」事故を防げない。**偽りの安全保証**になっている点が危険。

**修正案:** ブロックリストを正しい 64 桁 hex の秘密鍵に修正する(アドレスは入れない)。確実なのは、リテラル一致ではなく**導出アドレスを既知 dev アドレス集合と突き合わせる**方式に変える:

```bash
KNOWN_DEV_ADDRS=( "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" ... )
for a in "${KNOWN_DEV_ADDRS[@]}"; do
  [[ "${ADDR,,}" == "${a,,}" ]] && { echo "ERROR: known dev account"; exit 1; }
done
```
(導出ロジックは既存の `ADDR` 算出をそのまま流用できる。)

### 🟡 N-4(Low): CSP が `script-src 'unsafe-inline' 'unsafe-eval'` を許可
**場所:** `frontend/vercel.json`
`connect-src` の allowlist は良好だが、`script-src 'self' 'unsafe-inline' 'unsafe-eval'` は XSS / サプライチェーン注入に対する CSP の保護を大きく弱める。Next.js のハイドレーションで `unsafe-inline` が必要になりがちな事情は理解できるが、ウォレットドレイン対策の本丸なので nonce ベース CSP への移行を検討。少なくとも `unsafe-eval` の要否を実測し、不要なら除去する。

### 🟡 N-5(Low / 残存・受容済み): read-only reentrancy(`getReserves` がコールバック中に stale)
**場所:** `ProjectXPair.sol:147-150`(コールバック)、`:85-88`(doc)
状態変更再入は `nonReentrant`+`lock` で防御済み。スポット価格オラクルとして使うなという doc(`:20,83-84`)が追加され、TWAP 非実装も明記された。**受容方針として妥当**。外部プロトコルが本 pair をオラクル参照しないよう注意喚起を維持すること。

### ℹ️ Info(中央集権・要マルチシグ)
- `FeeCollector.withdraw`(onlyOwner)はプロトコル収益(と ETH)を全額引出可能。Vault owner は資金を直接抜けない設計(rebalance は idle を LP 化するのみ、keeper も抜けない)で良好だが、`feeToSetter` と各 owner 権限の集中は残る。
- **メインネット前に owner/feeToSetter をマルチシグ + Timelock 化**することを強く推奨。

---

## C. テスト十分性(再評価)

**前進:** `forge test` は **67 tests / 11 suites、全パス**。invariant テスト(`ProjectXInvariant` の `invariant_reservesMatchBalances`、128k calls・revert 0)、`FuzzTest`、`SecurityFixTest`、`AccessControlTest`(12)、`FeeCollectorTest`(5)、`MerkleAirdropTest`(9)、`HyperpoolLiquidityVaultTest`(7)が追加され、前回の重大ギャップ(removeLiquidity 未実行・fuzz/invariant ゼロ)は解消。

**残るギャップ(資金リスク順):**
1. **N-1 を捕捉するテストがない。** むしろ `FuzzTest.t.sol:80` の `<= DAILY_POOL`(単一トレーダー)がバグを正常扱いしている。→ first-mover 実証テスト + エポック総量 invariant を追加。
2. **invariant が `reservesMatchBalances` の 1 本のみ。** 追加すべき: `invariant_KNeverDecreasesAcrossSwaps`(burn 以外で K 非減少)、`invariant_LpShareValueMonotonic`、`invariant_EpochPointsNeverExceedPool`(N-1)、`invariant_VaultShareNeverInflates`(N-2)。
3. **Vault の first-depositor/donation テストがない。** `test_VaultDonationInflationGriefs` / `test_VaultFirstDepositLocksDeadShares`(修正後)を追加。
4. **K チェック手数料強制の直接テスト** — `test_DirectSwapMustLeaveLpFee`(pair.swap 直接呼びで fee 調整 K を満たさないと revert)。
5. **multi-hop / fee-on-transfer / deadline 失効 / エポック跨ぎ warp** の網羅は引き続き要確認。
6. **CI 強化:** `forge coverage --ir-minimum` に branch カバレッジ下限ゲート、`slither` 静的解析、wallet-mock E2E を CI 本流に組込み。CI の actions は SHA ピン済みのようだが(bare タグ参照は grep で未検出)、明示確認を推奨。

---

## D. アクションプラン(優先順)

| 優先 | 項目 |
|------|------|
| **P0(メインネット前 必須)** | **N-1** ポイント按分をエポック確定後計算に変更(or 正規化撤廃) → first-mover 実証テスト + 総量 invariant。**N-3** 鍵ガードのブロックリスト修正(導出アドレス照合方式へ) |
| **P1** | **N-2** Vault に dead-share/virtual-offset 導入 + 関連テスト。owner/feeToSetter のマルチシグ+Timelock 化 |
| **P2** | **N-4** CSP の `unsafe-eval` 除去（`unsafe-inline` は Next.js 制約で維持）。invariant 追加(K 非減少・エポック上限)。CI に coverage ゲート + slither |
| **P3** | 全修正完了後に**第三者監査**。money-handling である以上、外部監査なしの本番投入は非推奨 |

### 総評
前回の致命的欠陥群は確実に潰れており、設計・テスト体制は大きく改善した。残るブロッカーは **N-1(ポイント按分の新バグ)** と **N-3(鍵ガードの不備)** で、いずれも修正は小規模。N-2 と中央集権(マルチシグ化)を P1 で対応すれば、第三者監査に進める水準になる。
