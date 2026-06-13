# セキュリティ再レビュー & 修正案(2026-06-12)

対象: コントラクト全体(`contracts/src`)、フロントエンド、デプロイ/運用スクリプト、CI、テスト十分性。
手法: 4 系統の独立レビュー(コア AMM / インセンティブ系 / 運用・Web 層 / テスト評価)+ Critical/High はソースコードで直接裏取り済み。

> **結論(TL;DR)**: 現状のままメインネットにデプロイしてはいけない。
> **資金ロックを引き起こす Critical バグが 1 件**(`ProjectXPair.burn`)、**手数料モデルを破壊する High が 1 件**(K チェック)、**ポイント制度を無効化する High が 2 件**(`origin` 偽装・`claimDailyRewards`)を確認した。テストはこれらの欠陥を一切検出できておらず(branch カバレッジ 16%、fuzz/invariant テスト 0 件)、`removeLiquidity` に至っては一度も実行されていない。

---

## 1. Critical — 即時修正必須

### C-1. `burn()` が手数料発生後に必ずリバートし、LP 資金がロックされる
**場所:** `contracts/src/core/ProjectXPair.sol:125-131`

```solidity
uint256 liquidity = balanceOf(address(this));            // L122: ユーザーが償還する LP
uint256 feeLiquidity = feeOn ? _mintFee(...) : 0;        // L125: feeCollector 宛に mint される
...
_burn(address(this), liquidity);                          // L130: pair の残高はここで 0 に
if (feeLiquidity > 0) _burn(address(this), feeLiquidity); // L131: ★必ずリバート
```

`_mintFee`(L204)は `feeCollector` に mint するため、pair 自身は `feeLiquidity` を保有していない。L130 でユーザー分を burn した後の pair 残高は 0 なので、L131 は `ERC20InsufficientBalance` でリバートする。`feeLiquidity > 0` は「fee 有効 かつ スワップで K が成長した後」= 通常運用ではほぼ常に成立。つまり**取引開始後、最初の流動性引き出しから全 LP が資金を引き出せなくなる**。緊急脱出経路(skim 等)も存在しない。

**修正案:** L131 を削除する。プロトコル手数料 LP トークンは feeCollector の収益としてそのまま残すのが正しい(Uniswap V2 と同じ)。

```solidity
// L131 を丸ごと削除
_burn(address(this), liquidity);
```

---

## 2. High — リリースブロッカー

### H-1. K 不変量チェックがスワップ手数料を強制しておらず、LP 手数料(86%)が直接呼び出しで全額バイパス可能
**場所:** `contracts/src/core/ProjectXPair.sol:185-190`

現在のチェックは「生の K が減らない」だけで、Uniswap V2 のような fee 調整済み残高(`balance*1000 - amountIn*3`)での検証がない。プロトコル分(0.30% × 14% ≈ 0.042%)は事前に transfer 済みなので、チェックが実質強制するのはその 0.042% のみ。**Router を経由せず `pair.swap()` を直接呼ぶ MEV ボット/アービトラージャーは LP 手数料 0.258% を 1 円も払わずに取引できる**。「86% は LP へ」という設計が成立しない。

**修正案:** fee 込みの不変量チェックに置き換える(K チェック用残高はプロトコル分 transfer の影響も含めて一貫させる):

```solidity
uint256 balance0Adjusted = balance0 * 10_000 - amount0In * SWAP_FEE_BPS;
uint256 balance1Adjusted = balance1 * 10_000 - amount1In * SWAP_FEE_BPS;
require(
    balance0Adjusted * balance1Adjusted >= _reserve0 * _reserve1 * 10_000 ** 2,
    "ProjectXPair: K"
);
```
※ `10_000**2` 倍のスケールで乗算オーバーフローの余地が広がるため、リザーブ上限(uint112 相当)導入か `Math.mulDiv` の使用を併せて検討(L-3 参照)。

### H-2. `swap()` の `origin` 引数が呼び出し側の自由値 → ポイントを任意アドレスに付け替え可能(シビル/ウォッシュ取引)
**場所:** `ProjectXPair.sol:140, 171, 181` → `PointsDistributor.sol:47-64`

`swap` は誰でも直接呼べ、`origin` がそのまま `recordFeeContribution(pool, origin, totalFee)` に渡る。`PointsDistributor` 側は `user` と実際のトレーダーの一致を検証しない。攻撃者は任意のアドレス(自分のファーム用アドレスや被害者)にポイントを集中でき、H-1 と組み合わせると **約 0.042% のコストでポイントを無制限にファーミングできる**。相互リファラル(A→B, B→A は禁止されていない)で 10% ブースト+15% 紹介ボーナスも上乗せ可能。ポイントがエアドロップ配分の根拠なら、リーダーボードは完全に汚染される。

**修正案(推奨順):**
1. Factory に「信頼された Router」を登録し、`swap` 内で `msg.sender == trustedRouter` のときだけ `recordFeeContribution` を呼ぶ(直接呼び出しはポイント対象外にする)。Router は検証済みの `msg.sender` を `origin` として渡す。
2. 最低限でも、`origin` 引数を廃止して Router 経由のポイント記録に一本化する。
3. 併せて `ReferralRegistry.bindReferrer` で相互参照を拒否: `require(refereeToReferrer[referrer] != msg.sender)`。

### H-3. `claimDailyRewards()` は何も支払わずユーザーのポイント残高をゼロにする
**場所:** `contracts/src/core/PointsDistributor.sol:66-71`

```solidity
function claimDailyRewards() external returns (uint256 claimable) {
    claimable = userPoints[msg.sender];
    require(claimable > 0, ...);
    userPoints[msg.sender] = 0;          // 残高は消えるが
    totalPointsDistributed += claimable; // トークン送付は一切ない
}
```

報酬トークンも transfer も存在しない。UI から「Claim」として呼ばせると、**ユーザーは蓄積ポイントを失い、何も受け取らない**。

**修正案:** ポイントをオフチェーン集計用の読み取り専用台帳とするなら、この関数を削除する(`userPoints` をゼロにしない)。オンチェーン報酬にするなら、報酬資産・原資・按分計算(`DAILY_POOL` × ユーザーシェア)を実装してから transfer する。中途半端な現状が最も危険。

---

## 3. Medium

### M-1. `mint()` で `_mintFee` が `_update` の後に呼ばれ、プロトコル手数料が永久に mint されない
**場所:** `ProjectXPair.sol:110-112`
`_update` が先に `kLast` を新残高で上書きするため、`_mintFee` 内で常に `rootK <= rootKLast` となり mint されない(`burn()` は正しい順序であり、設計意図に反するバグと判断)。
**修正:** `burn()` と同様に `_mintFee` → `_mint` → `_update` の順に並べ替え、`_totalSupply` は `_mintFee` 後に再取得する。

### M-2. プロトコル手数料の二重徴収(直接 14% + `_mintFee` で K 成長の ~1/6)
**場所:** `ProjectXPair.sol:164-183` と `195-206`
スワップ毎に 14% を直接 transfer しながら、`_mintFee` でも K 成長(= LP に残した手数料)の約 16.7% を feeCollector に mint しており、86/14 の謳いより LP が希釈される。
**修正:** どちらか一方に統一する。「スワップ毎 14% 直接徴収」モデルなら `_mintFee`/`kLast` 機構を全削除(C-1, M-1 も同時に消滅し、コードが大幅に単純化される。**推奨**)。

### M-3. MerkleAirdrop に未請求資金の回収手段がなく、期限後に永久ロック
**場所:** `MerkleAirdrop.sol`(`fund` のみで withdraw なし)
**修正:** 期限後のみ実行可能な回収関数を追加:

```solidity
function recoverUnclaimed(address to) external onlyOwner {
    require(block.timestamp > claimDeadline, "MerkleAirdrop: NOT_EXPIRED");
    rewardToken.safeTransfer(to, rewardToken.balanceOf(address(this)));
}
```
※ 期限前は owner も引き出せない現仕様は「運営によるラグ不可」という美点なので、期限ゲートは必ず維持する。

### M-4. `DAILY_POOL` / エポック按分が未実装で、ポイント発行が無制限
**場所:** `PointsDistributor.sol:9, 47-64`
`DAILY_POOL = 1M` を宣言しながら実際は fee 1:1 で無制限に加算。**修正:** エポック確定時に `epochFeeContribution[user] * DAILY_POOL / epochTotalFees[epoch]` で按分するか、未使用の上限を削除して誤解を防ぐ。

### M-5. Oracle にゼロ価格・鮮度・デシマル検証がない
**場所:** `HyperCoreOracle.sol:15-21`、`L1Read.sol:50-62`
**修正:** 価格 getter に `require(price != 0)` を追加、`l1Block` を価格と一緒に返して鮮度検証可能にし、HyperCore の資産別デシマル規約をドキュメント化する。

### M-6. `contracts/.gitignore` の `!/broadcast` 否定ルールがルート設定を上書きし、テストネット(将来はメインネット)ブロードキャストがコミット可能
**場所:** `contracts/.gitignore:7`(`git check-ignore` で 998 のファイルが**無視されていない**ことを確認済み。`scripts/vercel-prepare.sh:33` は `git add -A` を推奨しており、一手でコミットされる)
**修正:** `contracts/.gitignore` の `!/broadcast` 行を削除し、`git check-ignore contracts/broadcast/DeployProjectX.s.sol/998/run-latest.json` が通ることを確認する。

### M-7. Synpress E2E がデプロイヤー本鍵(`MAIN_PRIVATE_KEY`)を MetaMask キャッシュに取り込み、既定パスワードが `Tester@1234`
**場所:** `frontend/test/wallet-setup/hyperevm-testnet.setup.ts:4,19-26`、`scripts/e2e-synpress-{cache,testnet}.sh:8`
デプロイヤーは MerkleAirdrop/PointsDistributor の owner かつ feeToSetter。メインネット鍵で同じ手順を踏むと管理者権限ごと漏えいするパターン。
**修正:** E2E 専用の低価値鍵 `E2E_PRIVATE_KEY` を必須化し `MAIN_PRIVATE_KEY` へのフォールバックを禁止、`SYNPRESS_WALLET_PASSWORD` 未設定時はエラーにする。

### M-8. デプロイスクリプトがシェル残留の `PRIVATE_KEY`(周知の Anvil 鍵を含む)をそのまま使う
**場所:** `scripts/dev-local.sh:42`(Anvil #0 鍵を export)、`scripts/deploy-testnet.sh:8-20`、`scripts/deploy-mainnet.sh:6`
ローカル開発後の同一シェルでデプロイすると、**公開鍵が周知のアドレスが owner のままメインネットに出る**事故が起こり得る。
**修正:** 両デプロイスクリプトで (a) `cast wallet address` でアドレスを導出して表示し、(b) Anvil 既定鍵(`0xf39F…2266` 等)を拒否、(c) `DEPLOYER_ADDRESS` 環境変数との一致確認 or 対話確認を必須にする。

### M-9. フロントの `addLiquidity` / `removeLiquidity` が `amountMin = 0` で送信(サンドイッチ攻撃可能)
**場所:** `frontend/src/lib/hooks/useDeFi.ts:170, 208`
スワップは 50bps の最小出力を計算しているが、流動性操作は無防備。
**修正:** 現リザーブからスリッページ設定(SettingsModal の値)を使って `aMin = a * (10000 - slippageBps) / 10000` を計算して渡す。`removeLiquidity` も LP シェア按分の期待値から mins を算出する。

### M-10. CSP(Content-Security-Policy)ヘッダーなし
**場所:** `frontend/vercel.json`
ウォレット接続型 DEX では、npm サプライチェーン侵害や将来の XSS によるウォレットドレイン対策の本丸が CSP。現状 `dangerouslySetInnerHTML`/`eval` は不使用(確認済み)なので厳格なポリシーを導入しやすい。
**修正:** `default-src 'self'`、`connect-src` に RPC(`rpc.hyperliquid.xyz` 等)と WalletConnect リレー、`frame-ancestors 'self'` を設定。WalletConnect モーダルの要件(`wss:` 等)と突き合わせてテストする。

---

## 4. Low / Info(要対応だが緊急度は低い)

| # | 場所 | 内容 | 修正 |
|---|------|------|------|
| L-1 | `ProjectXRouter.sol:53` | `removeLiquidity` に `pair != address(0)` チェックなし | `require(pair != address(0), "PAIR_NOT_EXISTS")` 追加 |
| L-2 | `ProjectXPair.sol:151-154` | コールバック中に `getReserves()` が古い値を返す read-only reentrancy | TWAP がない旨と「スポットオラクル利用禁止」を明記、または `_update` をコールバック前に移動 |
| L-3 | `ProjectXPair.sol:188` | リザーブが uint256 無制限で K 乗算がオーバーフローし得る(DoS) | uint112 相当の上限 or `Math.mulDiv` |
| L-4 | `PointsDistributor.sol:82-88` | エポックが 1 回しか進まず境界がドリフト、`epochFeeContribution` がエポック毎にリセットされない | `while` ループ + `epochStart += EPOCH_DURATION`、`mapping(uint256 => mapping(address => uint256))` に変更 |
| L-5 | `MerkleAirdrop.sol` | ルート更新時に `claimed` が引き継がれ、追加配布で既請求者が永久ブロック。pause 機構なし | ラウンド毎の `mapping(bytes32 => mapping(address => bool))` + `Pausable` 導入 |
| L-6 | `ReferralRegistry.sol:30-39` | 相互リファラル可、コードの先取り登録(squatting)可 | H-2 修正で実質緩和。相互参照拒否を追加 |
| L-7 | `scripts/testnet-check.sh:42` ほか | `cast --private-key` の CLI 引数で `ps` に鍵が露出 | stdin / keystore 方式へ |
| L-8 | `.github/workflows/ci.yml` | Actions がタグ参照(SHA ピンなし)、`permissions` 未設定 | コミット SHA でピン + `permissions: contents: read` |
| L-9 | `frontend/.../useLiFi.ts:124-159` | Li.FI の `transactionRequest` を無検証で署名(プロキシ側の固定化・exact-approval 済みで残余リスクは小) | `txReq.chainId === quote.action.fromChainId` のアサート追加 |
| L-10 | `frontend/src/app/api/lifi/*` | プロキシがレート制限なし(API キー quota の消費攻撃のみ) | per-IP レートリミット |
| Info | Factory / FeeCollector | `createPair` は許可制、`FeeCollector.withdraw` は owner が全額引出可、TWAP なし | 中央集権リスクとしてユーザー向けに開示。マルチシグ/Timelock 化を推奨 |

**問題なしを確認した点(裏取り済み):** Merkle リーフは OZ 標準のダブルハッシュで second-preimage 耐性あり/二重請求防止と本人限定請求は正しい/全トークン移動は SafeERC20/MINIMUM_LIQUIDITY による初回預入保護あり/コミット履歴に秘密情報なし(ハードコード鍵はすべて周知のテスト値)/フロントは無限 approve なし・チェーン ID 検証あり・999.json はゼロアドレスで不活性/CI に秘密情報なし・`pull_request_target` 不使用。

---

## 5. テスト十分性の評価

**現状: 資金を扱うプロジェクトの水準に達していない。**

- `forge test`: 28 件すべてパス。ただし **行カバレッジ 54.9%、branch カバレッジ 16.1%**(`forge coverage --ir-minimum` 実測)。
- **fuzz テスト 0 件、invariant テスト 0 件**。`foundry.toml` の `[profile.ci]` に fuzz/invariant 設定があるが空回り。
- **`removeLiquidity` / `burn` を実行するテストが 1 つも存在しない** — だからこそ C-1(資金ロック)が検出されなかった。
- `_mintFee` が正の値を返すテストなし(M-1 の死蔵パスも未検出)。`pair.swap` 直接呼び出しテストなし(H-1, H-2 未検出)。
- `FeeCollector.withdraw`(プロトコル収益の全額を保管)が**完全に未テスト**。Router の branch カバレッジ 4.5%。
- CI で回るのは forge test + フロント lint/typecheck/vitest/smoke E2E のみ。wallet-mock E2E は CI 対象外、カバレッジゲート・静的解析(slither)なし。

### 追加すべきテスト(優先順)

1. **バグ実証テスト(修正前に書いて red を確認 → 修正で green に)**
   - `test_BurnRevertsWhenProtocolFeeAccrued` — 流動性供給 → スワップで K 成長 → `removeLiquidity` がリバートすることを実証(C-1)
   - `test_DirectSwapBypassesLpFee` — `pair.swap` 直接呼びで LP 手数料ゼロの取引が通ることを実証(H-1)
   - `test_DirectSwapSpoofsPointsOrigin` — `origin=victim` でポイントが任意付与されることを実証(H-2)
   - `test_MintFeeMintsToFeeCollector` — mint 経路で feeCollector に LP が mint されない現状を実証(M-1)
2. **invariant テスト** — ランダムな swap/mint/burn ハンドラで (a) K が burn 以外で減少しない、(b) LP 1 株あたり価値が単調非減少、(c) `reserve == balanceOf` 整合
3. **fuzz テスト** — `testFuzz_SwapRespectsK(amountIn, dir)`、`testFuzz_ClaimWithGeneratedTree(leaves)`(N リーフの Merkle ツリーで全員請求し残高ゼロ確認)、`testFuzz_PointsConservation(fee)`
4. **アクセス制御のネガティブテスト一式** — Factory(`IDENTICAL`/`ZERO_ADDRESS`/`PAIR_EXISTS`/非 owner setter)、Pair(`initialize`/`setConfig` 非 factory)、MerkleAirdrop(非 owner `setMerkleRoot`/`fund`、不正 amount、`INSUFFICIENT_BALANCE`)、PointsDistributor(`UNAUTHORIZED`/`POOL_MISMATCH`/`deauthorizePool`)、**FeeCollector 全関数**
5. **エッジケース** — 初回極小預入、寄付インフレ攻撃、fee-on-transfer トークン経由 Router、マルチホップ(3 トークン)、deadline 失効、エポック跨ぎ(`vm.warp`)、悪意あるフラッシュスワップコールバックの再入
6. **CI 強化** — `forge coverage --ir-minimum` に branch カバレッジ下限ゲート(段階的に 16%→60%→80%)、slither 追加、wallet-mock E2E を CI に組込み

---

## 6. 推奨アクションプラン(優先順)

| 優先 | 項目 | 工数目安 |
|------|------|----------|
| **P0(デプロイ前必須)** | C-1 burn 修正 / H-1 K チェック修正 / H-2 origin 廃止+Router 認証 / H-3 claimDailyRewards 削除 or 実装 / M-1+M-2 fee 機構の一本化(`_mintFee` 削除推奨) | コード変更は小、設計判断含め 2-3 日 |
| **P0(同時)** | 上記のバグ実証テスト → 修正 → invariant/fuzz テスト導入 | 2-3 日 |
| **P1(メインネット前)** | M-3 エアドロ回収 / M-6 gitignore / M-7 E2E 鍵分離 / M-8 デプロイ鍵ガード / M-9 流動性スリッページ / owner のマルチシグ化 | 1-2 日 |
| **P2** | M-4 / M-5 / M-10 CSP / Low 全件 / CI 強化(SHA ピン、slither、カバレッジゲート) | 2-3 日 |
| **P3** | 外部監査(上記修正完了後)。資金を扱う以上、第三者監査なしのメインネット投入は推奨しない | — |
