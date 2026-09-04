# HYPE建てマネージドLP Vault 追加手順 (UPUMP / UBTC / UETH ±5%)

稼働中の HYPE/USDC Vault に**一切触れずに**、HYPE建てペアを 1 つずつ本番投入するための手順書。

対象コミット時点で、コントラクト・keeper・daily-rewards・デプロイスクリプト・設定レジストリの
一般化はすべて実装済み。ここに書くのは「安全に載せる順番」と「干渉しないための境界」。

---

## 1. なぜ既存システムに干渉しないのか（設計上の隔離ライン）

隔離は 4 層あり、それぞれ機械的に保証されている。

| 層 | 隔離手段 | 保証の根拠 |
|---|---|---|
| オンチェーン | 稼働中 Vault/Adapter/Airdrop の**バイトコードは不変**。新ペアは別アドレスに新規デプロイ | ソースを一般化しても既存デプロイ済みコントラクトは書き換わらない |
| 価格計算 | `priceDiv = 10^(baseDec + 18 − quoteDec)`。USDC(6)/WHYPE(18) では `1e30` に還元 | `test_RegressionUsdcWhypePriceDivIs1e30` が回帰一致を証明 |
| 設定 JSON | 新ペアは `pools[]` 配下のみ。トップレベル（= legacy HYPE/USDC）は書き換え禁止 | `upsertPoolPreservingTopLevel` がトップレベル差分を検知して**書き込みを拒否** |
| Cashdrop 状態 | `POOL_KEY` 指定時は `pools[].cashdrop` だけを読み書き。未指定時は従来どおりトップレベル | `resolveRewardScope` + `mergeScopeOntoDisk`（保存時にディスクを読み直して自分の担当分だけ書き戻す） |

**同時実行しても壊れない**: daily-rewards は起動時に JSON を読み、終了時に保存する。従来は
オブジェクト全体を書き戻していたため、legacy cron とプール cron が時間的に重なると
後から保存した側が相手の Cashdrop 更新を巻き戻していた。現在は保存時にファイルを読み直し、
legacy 実行は `pools[]` を、プール実行はトップレベルを、それぞれ触らない。

---

## 1.5 確定アドレス（2026-09-01 にチェーン上で照合済み）

仕様書のアドレスは省略形だったため、Project X ファクトリ
`0xFf7B3e8C00e57ea31477c32A5B52a58Eea47b072` の `getPool(base, WHYPE, 3000)` から導出し、
省略形の前後・symbol・decimals がすべて一致することを確認した。

| ペア | base token | dec | pool | priceDiv | token0 |
|---|---|---|---|---|---|
| UPUMP/HYPE | `0x27eC642013bcB3D80CA3706599D3cdA04F6f4452` | 6 | `0x78cc152A531DBde2F3Fe7001ad659fa120Fa893b` | 1e6 | UPUMP |
| UBTC/HYPE | `0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463` | 8 | `0x0D6ECB912b6ee160e95Bc198b618Acc1bCb92525` | 1e8 | WHYPE |
| UETH/HYPE | `0xBe6727B535545C67d5cAa73dEa54865B92CF7907` | 18 | `0xaf80230eB13222DB743C21762f65A046bb5F5437` | 1e18 | WHYPE |

3 プールとも `fee=3000` / `tickSpacing=60` / `observationCardinality=360`。
**`observe(900s)` は 3 プールとも現時点で成功する**ため、カーディナリティ増設を待たずに
`TWAP_REQUIRED=true` でデプロイしてよい（デプロイ直前に再確認すること）。

## 2. デプロイ順序（1 ペアずつ、桁の易しい順）

**UETH (18桁) → UBTC (8桁) → UPUMP (6桁)** の順。18/18 は priceDiv=1e18 で
桁ズレが最も起きにくく、最初の実プール検証に向く。

各ペアは前のペアが 1 日以上安定稼働してから次へ進む。

### 2.1 事前確認（デプロイ前）

```bash
cd contracts && forge test                 # 非fork分の全緑
cd .. && node --test scripts/__tests__     # JS 側

# 実プールに対する桁検証（mock NPM は実桁を再現しないので、これが本命のガード）
cd contracts && forge test --match-path 'test/HypeQuotedMainnetFork.t.sol' -vv
```

`HypeQuotedMainnetFork` は 3 ペアそれぞれについて、実 slot0 に対する価格スケール・
±5% tick・実 NPM/router 経由の deposit→NAV→withdraw 往復・`observe(900s)` の可否を検証する。
**2026-09-01 時点で 3 ペアとも合格**（下記 2.7 参照）。

### 2.2 デプロイ

```bash
export RPC=https://rpc.hyperliquid.xyz/evm
export PRIVATE_KEY=...                 # メインネット deployer（この環境には無い）
export QUOTE_TOKEN=0x5555555555555555555555555555555555555555
export FEE=3000 UPPER_RANGE_BPS=500 LOWER_RANGE_BPS=500
export TWAP_WINDOW=900 TWAP_REQUIRED=true

# UETH から。UBTC / UPUMP は 1.5 の表のアドレスに差し替えて同じ手順を繰り返す。
export BASE_TOKEN=0xBe6727B535545C67d5cAa73dEa54865B92CF7907
export POOL=0xaf80230eB13222DB743C21762f65A046bb5F5437

# --broadcast を付けずに一度シミュレートしてから本番投入する
forge script script/DeployHyperpoolPair.s.sol:DeployHyperpoolPair --rpc-url $RPC
forge script script/DeployHyperpoolPair.s.sol:DeployHyperpoolPair --rpc-url $RPC --broadcast --slow
```

ガス見積もりは 1 ペアあたり約 0.0028 HYPE（13.1M gas）。

`adapter.setPool()` は pool の `token0/token1/fee/tickSpacing` を検証する。
プールアドレスや fee tier を取り違えた場合はここで revert するので、
「間違ったプールに配線されたまま入金開放」は起きない。

### 2.3 TWAP ガードの確認

3 プールとも `observationCardinality=360` で `observe(900s)` が通るため、
`TWAP_REQUIRED=true` でデプロイして問題ない。念のためデプロイ後に実際の値を確認する:

```bash
cast call $POOL "observe(uint32[])(int56[],uint160[])" "[900,0]" --rpc-url $RPC
cast call $VAULT "twapRequired()(bool)" --rpc-url $RPC   # true であること
cast call $VAULT "twapWindow()(uint32)" --rpc-url $RPC   # 900
```

万一 `observe` が revert する場合のみ、`vault.increasePoolObservationCardinality(n)` で増設し、
リングバッファが 900 秒ぶん埋まるのを待ってから `setTwapRequired(true)` に切り替える。
その間は fail-open なので**入金を開放しないこと**。

### 2.4 シード → keeper 1 周 → 確認

```
運営小口シード入金 → keeper 1周（deployIdle + rebalance）
→ adapter.tickLower/tickUpper が現在 tick を挟んでいるか
→ vault.totalAssetsUsdc() が入金額（WHYPE建て）と一致するか
```

ticks と NAV が合わない場合は**入金を開放せずに停止**。桁スケールの誤りである可能性が高い。

### 2.5 JSON 登録

```bash
BASE_TOKEN=... POOL=... TWAP_WINDOW=900 \
  node scripts/finalize-deployment.mjs 999 hyperEVM_mainnet --pair ueth-whype
```

`--pair` はトップレベルを 1 バイトも変更しない。`contracts/deployments/999.json` と
frontend 側のコピー両方に `pools[]` を upsert する。

なお `--pair` を付けない通常の finalize は broadcast からファイルを作り直すため
`pools[]` を消してしまう。すでに `pools[]` がある場合はエラーで止まるようにしてあるが、
そもそも稼働後に通常 finalize を走らせないこと。

### 2.6 cron 登録

`scripts/cron/hyperpool.example.crontab` の該当ブロックをコメント解除。
分をずらしてあるのはログの可読性のため（同時実行しても状態は壊れない）。

**現行 mainnet keeper cron は 251edf5 で停止中**。新ペアの cron を入れることは
legacy keeper の再有効化を意味しない。legacy を再開する場合は別途明示的に判断する。

---

## 3. 運用中の禁止事項

稼働中 HYPE/USDC を守るための不可侵ライン:

- `POOL_KEY` を**付けずに**新ペアのスクリプトを実行しない（トップレベル Cashdrop を書き換えてしまう）
- 逆に legacy の日次実行に `POOL_KEY` を付けない
- `deployments/999.json` のトップレベル項目を手で編集しない
- 稼働中 Vault / Adapter / Airdrop に対して `setPool` / `setRangeBps` / `setTwapWindow` を実行しない
  （旧バイトコードには TWAP まわりの関数自体が存在しない）
- 通常の `finalize-deployment.mjs`（`--pair` なし）を本番 chain 999 に対して実行しない

---

## 4. 今回入れた安全弁（レビューで追加した分）

| 対象 | 内容 | 防ぐ事故 |
|---|---|---|
| `HyperpoolVault` コンストラクタ | adapter の quote/base と vault の引数一致を必須化 | quote と base を取り違えたデプロイ（全評価が反転する） |
| `ProjectXAdapter.setPool` | pool の token0/token1/fee/tickSpacing(=60) を検証 | 誤ったプールへの配線、0.3% 以外の fee tier |
| `HyperpoolVault.rebalance` | オラクル未設定時は keeper の指値をプール spot ±5% に制限 | keeper の桁ミスで LP レンジが market から桁違いに外れる |
| `minimumVaultShares` | `10^quoteDec / 1000`（USDC では従来どおり 1000） | 18桁 quote で dead share が実質ゼロになり share inflation 耐性が消える |
| 手数料スワップの minOut | refPrice と pool spot の**小さい方**を採用 | 古い refPrice で minOut が到達不能になり harvest が黙って失敗し続ける |
| `daily-rewards` 保存 | 保存時にディスクを読み直し自分のスコープだけマージ | legacy 実行とプール実行が重なった際の相互巻き戻し |
| `finalize-deployment` | `pools[]` がある状態での全体 finalize を拒否 | 全プールの Cashdrop 状態の消失 |

---

## 5. mainnet-fork 検証の結果（2026-09-01）

`forge test --match-path 'test/HypeQuotedMainnetFork.t.sol'` — 3 ペアとも pass。

| ペア | adapter 価格 (quote/base×1e18) | 独立再計算 | live tick | 管理レンジ | 往復回収 |
|---|---|---|---|---|---|
| UETH | 29148733971583437649 | …438014 | -33726 | -34260 〜 -33180 | 99.75% |
| UBTC | 930830731790027262217 | …685655775854044 | -298635 | -299160 〜 -298080 | 99.75% |
| UPUMP | 53202564062399 | 53202564062399 | 177905 | 177360 〜 178440 | 99.75% |

「独立再計算」は adapter とコードを共有しない別実装で slot0 から算出した値。桁がずれていれば
10^2 以上の差になるので、この一致は priceDiv の指数が正しいことの直接的な証拠。
レンジ幅は 3 ペアとも 1080 tick（±5% ≒ ±487 tick + spacing 丸め）。
往復ロスの 0.25% は片側スワップの 0.3% 手数料と LP 丸めで説明がつき、3 ペアで同一。

デプロイスクリプト自体も 3 ペアぶん `--broadcast` 無しでシミュレート済み、全て成功。

## 6. 残タスク

- ~~本番ブロードキャスト（UETH / UBTC / UPUMP）~~ — **2026-09-02 完了**（下記アドレス表）
- ~~Mac cron 登録~~ — **2026-09-04 開発 Mac は全停止**。定期実行は **別運用マシン**（[cron-運用マシン.md](./cron-運用マシン.md)）
- ~~frontend の複数プール UI~~ — **2026-09-02** `/pools` 別ルート（既存 HYPE/USDC タブは不変）。本番: https://hyper-evm-ten.vercel.app/pools
- ~~プール内ライブ APR / 収益~~ — `/pools/[key]` に GeckoTerminal APR + HYPE 建て earnings 表示済み

### デプロイ済みアドレス（2026-09-02）

| key | Vault | Adapter | Airdrop |
|-----|-------|---------|---------|
| `ueth-whype` | `0x1399DeAB2A70CaAB308Ac54c1544bfA5D10731F8` | `0x55E9d473Cdfda2F8493D512c6db365cF02eCF33E` | `0xf0a6708ac8090d76775c3125AA19CFDF7598C371` |
| `ubtc-whype` | `0x10F98CDfC561A4C9eb253C22f05ff9cBB656D018` | `0x768f4909eE0De4eb9f538912904CBEf8e2426e27` | `0x4BADD6a5352CD953893E4eB05598781D17BC63cb` |
| `upump-whype` | `0x125cbaC752A93010D856007b0d1EaFCa89658082` | `0xb03f65a9742e0e1FB4Ca6064f53c8eBb22A7ef51` | `0x9AEde1F72e4Db59FfF8ED965873a58BD2554Aa6c` |
