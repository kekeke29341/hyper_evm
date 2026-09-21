# 2026-09-21 HYPE建てプール: cron 不発とレンジ外ポジション

## ステータス (2026-09-21)

| 項目 | 状態 | 担当 |
|---|---|---|
| コード修正 (cron flock / keeper preflight / APR UI) | **main に merge 済み** | — |
| オンチェーン復旧 (ubtc / upump レンジ復帰) | **完了** | 開発 Mac |
| Windows crontab の `env POOL_KEY=` 修正 | **未着手** | Windows (`keiohigh2nd`) |
| Windows リポジトリ `git pull` | **未着手（必須）** | Windows |

→ Mac 実施の詳細は「開発 Mac で実施したこと」、Windows 依頼は「Windows 機への依頼」を参照。

## 概要

ユーザーから「まだ機能していない」という申告があり調査した。原因は独立した 2 件のバグで、
どちらも HYPE 建てプール (`ubtc-whype` / `ueth-whype` / `upump-whype`) のみに当たっている。
legacy HYPE/USDC vault は正常に動いている。

1. **pool の cron が一度も実行されていない**。`flock` がコマンドをシェル経由せず直接 exec するため、
   `POOL_KEY=ubtc-whype` がプログラム名として扱われていた。
2. **レンジを完全に外れた LP ポジションは `rebalance()` で復帰できない**。
   `ProjectXAdapter.rebalance()` がスワップせずに再 mint するため、片側 100% になると詰む。

結果として `ubtc-whype` は 2026-09-18 08:00 JST 頃からレンジ外で手数料ゼロ、配布も止まっている。
さらにその状態の vault に新規入金が入り、NAV が 6.84 → 299.31 WHYPE (約 28,000 USD) に増えた。
入金は全額 UBTC にスワップされ、手数料の出ないポジションに入っている。

資金の消失はない。出金はいつでも可能。

## 対象

| 項目 | 値 |
|---|---|
| Chain | HyperEVM Mainnet `999` |
| ubtc-whype vault | `0x10f98cdfc561a4c9eb253c22f05ff9cbb656d018` |
| ubtc-whype adapter | `0x768f4909ee0de4eb9f538912904cbef8e2426e27` |
| ubtc-whype pool (Project X 0.3%) | `0x0D6ECB912b6ee160e95Bc198b618Acc1bCb92525` |
| upump-whype adapter | `0xb03f65a9742e0e1fb4ca6064f53c8ebb22a7ef51` |
| ueth-whype adapter | `0x55e9d473cdfda2f8493d512c6db365cf02ecf33e` |
| keeper / owner wallet | `0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC` |

## 原因 1: pool cron が flock で即死していた

crontab の pool 行はこの形だった。

```
20 7 * * * TZ=Asia/Tokyo flock -n /opt/hyperpool/locks/hyperpool-harvest-ubtc-whype.lock POOL_KEY=ubtc-whype /opt/hyperpool/hyper_evm/scripts/cron/run-daily-harvest-vps.sh
```

`flock(1)` は `flock [options] file command [args]` で、command を **シェルを経由せずそのまま exec** する。
したがって `POOL_KEY=ubtc-whype` はプログラム名として解釈され、`/var/log/hyperpool/daily.log` に

```
flock: failed to execute POOL_KEY=ubtc-whype: No such file or directory
flock: failed to execute POOL_KEY=ueth-whype: No such file or directory
flock: failed to execute POOL_KEY=upump-whype: No such file or directory
```

が出て harvest / distribute / keeper の全 12 ジョブが即死していた。legacy 行は env 前置きが無いので無事。

2026-09-19 に lock ディレクトリを `/var/lock` から `/opt/hyperpool/locks` に移す修正が入る前は、
同じ行が `flock: cannot open lock file /var/lock/...: Permission denied` で落ちていた。
つまり **pool の cron は自動実行に一度も成功していない**。

生成元は `scripts/cron/install-vps-crontab.sh` の 76-87 行。
`scripts/cron/install-mac-crontab.sh` には flock が無いので、Mac 運用期 (09-02 から 09-04) は配布できていた。

修正は `env(1)` を挟むだけ。

```
flock -n $LOCK_DIR/x.lock env POOL_KEY=ubtc-whype $HARVEST
```

## 原因 2: adapter.rebalance() は片側 100% のポジションを再センタリングできない

`ProjectXAdapter.rebalance()` (contracts/src/core/ProjectXAdapter.sol:371) は
`decreaseLiquidity` で全量引き出し、`collect` した後、**スワップせずに** 新レンジで `npm.mint` する。

価格がレンジ内にある間はポジションが両トークンを持つので再 mint は成立する。
価格がレンジを完全に外れると、引き出した中身は片側トークン 100% になり、中心レンジの mint は
liquidity = 0 になって `UniswapV3Pool.mint` の `require(amount > 0)` で revert する。
これはメッセージの無い require なので、HyperEVM の RPC からは revert data 無しの
`execution reverted` としてしか返らず、キーパーは毎回そこで落ちていた。

`adapter.rebalance` を vault 名義で eth_call して切り分けた結果:

| 渡した ref price | 新レンジの位置 | 結果 |
|---|---|---|
| spot | 現在価格をまたぐ (両トークン必要) | REVERT |
| spot x 1.10 | 全域が UBTC 側 (token1 のみ必要) | OK |
| spot x 0.90 | 全域が WHYPE 側 (token0 のみ必要) | REVERT |

deposit 経路 (`HyperpoolVault._deployBalancedToAdapter` から `_balanceSingleSidedDeposit`) は
swapRouter を使う比率調整を持っているので、`deployIdle()` は正常に動く。
**スワップ調整が rebalance 経路にだけ無い**のが穴。

### 当時のオンチェーン状態

| 項目 | 値 |
|---|---:|
| pool tick | `-297920` |
| adapter range | `[-299340, -298260]` |
| レンジ内か | No (上抜け) |
| `rangeDepositRatioBps()` | `[0, 10000]` (UBTC 100%) |
| `harvestFees()` シミュレーション | `0` |
| positionTokenAmounts | `0 WHYPE / 0.345 UBTC` |
| vault `totalAssetsUsdc()` | `299.311628664351181609 WHYPE` |
| vault `totalSupply()` | `321.772571925738629972` |
| 既知 3 アドレスの持分合計 | 約 2.2% |

GeckoTerminal の 1 時間足では 2026-09-17 23:00 UTC (09-18 08:00 JST) に
レンジ下限 900.3 WHYPE/UBTC を割り込んでいる。以降ずっとレンジ外。

### 配布履歴

| 日時 (UTC) | 件数 | tx |
|---|---|---|
| 09-02 / 09-03 / 09-04 | 1 (オーナー dust のみ) | Mac cron 期 |
| 09-04 から 09-19 | **なし** | cron 死亡期間 |
| 09-19 05:38 | 2 | `0xe42c06d629473c1a95449d6d542ecf4de8e8d7a58e6c94e97af49c464ac1ce50` |
| 09-19 05:54 | 3 | `0xb70513e74d19c5b543c4b33b9f4438effbc78ddea9e03b6089ea18cf6cd4793e` |
| 09-20 / 09-21 | **なし** | cron 死亡 |

配布機構そのものは正常。09-19 の 2 本は receipt 上でユーザーウォレットへの WHYPE 着金を確認済み
(`0xde6B30F1159fbb220B5029De4e0dF984F021bEEA` へ 0.1084 + 0.01434 WHYPE)。

## 原因 3 (表示): pool APR が実態と乖離していた

`/api/pool-apr` は GeckoTerminal の**プール全体**の手数料 APR をそのまま返していた。
vault がレンジ外で収益ゼロの状態でも

```
{"poolAprPercent":25.2,"netAprPercent":15.1,"tvlUsd":7014874,"volume24hUsd":1614967}
```

を返し、UI は "Your net APR 15.1%" "Paid in WHYPE daily ~JST 9:00" と表示し続けていた。
ユーザーの苦情の直接の引き金はこれ。

## このアップデートで入れた変更

| ファイル | 内容 |
|---|---|
| `scripts/cron/install-vps-crontab.sh` | pool 12 行を `flock -n LOCK env POOL_KEY=... CMD` に修正 |
| `scripts/keeper-rebalance.mjs` | rebalance の preflight を追加。revert 時に tick とレンジを読み、レンジ外なら `REBALANCE BLOCKED` と復旧手順を出して exit 3。RPC 障害と revert は区別し、障害時は従来どおり write に進む |
| `frontend/src/app/api/pool-apr/route.ts` | 現在 tick と adapter レンジを読んで `vaultInRange` を返す。レンジ外なら `netAprPercent: 0` |
| `frontend/src/lib/hooks/usePoolApr.ts` | `outOfRange` / `vaultInRange` を公開。レンジ外は netAprLabel を `0%` に |
| `frontend/src/components/pools/PoolEarningsPanel.tsx` | レンジ外の警告バナー。Accruing Cashdrop の説明文もレンジ外用に差し替え |
| `frontend/src/components/ui/shared.tsx` | StatPill に `amber` を追加 |

**contracts は変更していない。** 原因 2 の恒久対策はコントラクト修正が要る (後述)。

## 検証済み事項

production を触らない scratch clone で実施。

- `tsc --noEmit` clean
- `eslint` (変更 4 ファイル) clean
- `scripts/__tests__/*.test.mjs` 4 件すべて PASS
- `node --check scripts/keeper-rebalance.mjs` / `bash -n scripts/cron/install-vps-crontab.sh` OK
- preflight の実チェーン挙動: legacy = 通過 (従来どおり)、`ueth-whype` = 通過、
  `ubtc-whype` / `upump-whype` = `REBALANCE BLOCKED` で exit 3
- レンジ判定ロジックの実チェーン確認:
  `ueth-whype` inRange=true / `ubtc-whype` false / `upump-whype` false

### 復旧手順の成立確認

WHYPE (`0x5555555555555555555555555555555555555555`) の balances マッピングは **slot 3** (WETH9 形式)。
アダプタの WHYPE 残高を state override で与えて `vault.rebalance(spot)` を eth_call:

| アダプタの WHYPE | 結果 |
|---|---|
| 0 (現状) | REVERT |
| 0.005 | **OK** (`estimateContractGas` = 806,626 gas、約 0.000127 HYPE) |
| 0.015 | OK |

keeper の native HYPE は 0.008596 なので gas は約 67 回分ある。

注記: `eth_simulateV1` (drpc のみ対応) で transfer と rebalance を連鎖させると結果が安定しなかった。
`eth_call` + state override の結果を正とする。

## 開発 Mac で実施したこと (2026-09-21 JST)

対象マシン: 開発用 Mac（Cursor / `.env.testnet` の `MAIN_PRIVATE_KEY` = 運営ウォレット
`0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC`）。**crontab は触っていない**（開発 Mac の cron は 2026-09-04 停止済みのまま）。

| # | 作業 | 結果 |
|---|---|---|
| 1 | `git pull origin main` | `9242e03` → `96d6101`（本アップデート一式を取り込み） |
| 2 | オンチェーン状態確認 | ubtc / upump ともレンジ外・adapter WHYPE=0・ratio 片側 100% を再確認 |
| 3 | WHYPE シード送金 | 下記 tx 表 |
| 4 | `keeper-rebalance.mjs` 手動実行 | `POOL_KEY=ubtc-whype` / `upump-whype` 各 1 回、exit 0 |
| 5 | 本番 API / UI 確認 | `vaultInRange: true`、レンジ外バナー無し |

### オンチェーン復旧の tx 記録

| 手順 | HyperEVMScan |
|---|---|
| ubtc adapter へ 0.005 WHYPE | [0x90a0ca1a…d49aec](https://hyperevmscan.io/tx/0x90a0ca1a13f485bd2f9cd3b1d2d9afe1444a4aec332a98d0c17ff3a6f5d49aec) |
| upump adapter へ 0.001 WHYPE | [0x69aced41…faa75b](https://hyperevmscan.io/tx/0x69aced419e93d576982cd7d1e942e96b89fc696b88c3a2d569edaebba2faa75b) |
| ubtc `harvestFees` (rebalance 前) | [0x9951e589…64c439](https://hyperevmscan.io/tx/0x9951e589945a6c2dc2bc3af76e0bd8bc092e871673c5c3f21fe6a4eed164c439) |
| ubtc `rebalance` → ticks `[-298560, -297480]` | [0xcca547a1…f6c853](https://hyperevmscan.io/tx/0xcca547a179babf67dd302eaeb688a59b369d962ab21321a30fd7735bc4f6c853) |
| ubtc `deployIdle` | [0x46e01755…12b61b8](https://hyperevmscan.io/tx/0x46e017554dd41d9428ffb9ef031bdf4f077c7dbc58a93c4acedb9497c12b61b8) |
| upump `harvestFees` | [0x6bf35ca4…d84113](https://hyperevmscan.io/tx/0x6bf35ca482f5febd1e20e88bc06a3a0d6437627f59cf740a90aa9cc5cdd84113) |
| upump `rebalance` → ticks `[175920, 176940]` | [0xe9f6699d…92c8511](https://hyperevmscan.io/tx/0xe9f6699d4d36cf28cb7c1f1893b664c4100b105d24567e1b8143d27ef92c8511) |
| upump `deployIdle` | idle ≈ 0.017 WHYPE &lt; min 0.2 のため **skip**（レンジ復帰には不要） |

実行コマンド（参考）:

```bash
# 鍵は .env.testnet の MAIN_PRIVATE_KEY（表示しない）
cast send 0x5555…5555 "transfer(address,uint256)(bool)" <ADAPTER> <AMOUNT_WEI> \
  --private-key "$PRIVATE_KEY" --rpc-url https://rpc.hyperliquid.xyz/evm --legacy

DEPLOYMENT_CHAIN=999 POOL_KEY=ubtc-whype SKIP_ORACLE=1 node scripts/keeper-rebalance.mjs
DEPLOYMENT_CHAIN=999 POOL_KEY=upump-whype SKIP_ORACLE=1 node scripts/keeper-rebalance.mjs
```

### 復旧後の確認値 (2026-09-21 11:23 JST 頃)

| pool | spot tick | adapter range | `rangeDepositRatioBps` | `/api/pool-apr` |
|---|---:|---|---|---|
| ubtc-whype | `-298021` | `[-298560, -297480]` | ≈ 5001 / 4999 | `vaultInRange: true`, netApr ≈ 17.6% |
| upump-whype | `176437` | `[175920, 176940]` | ≈ 4923 / 5077 | `vaultInRange: true`, netApr ≈ 65% |
| ueth-whype | (変更なし) | in range | — | `vaultInRange: true` |

UI: https://hyper-evm-ten.vercel.app/pools/ubtc-whype ・ `/pools/upump-whype`  
→ LP range が上記 ticks、レンジ外警告なし、net APR 表示あり。

**Windows 機でオンチェーン復旧をやり直す必要はない。**

---

## Windows 機 (`keiohigh2nd` / WSL) への依頼

本番 cron は **このマシンだけ** が動かす。以下を **この順で** 実施すること。
開発 Mac では cron を入れない（二重 harvest / 二重 keeper 防止）。

### ✅ チェックリスト（必須）

| # | 優先 | 作業 | 完了 |
|---|---|---|---|
| W1 | **P0** | WSL リポジトリを `git pull`（下記コマンド） | ☐ |
| W2 | **P0** | crontab の pool 行を `flock … env POOL_KEY=…` に修正 | ☐ |
| W3 | P1 | 修正後の flock 動作スモークテスト | ☐ |
| W4 | P2 | （任意）RPC failover `stash@{0}` を適用 | ☐ |

### W1. 必ず先に pull（翌朝の distribute push 失敗防止）

日次 distribute は `999.json` を commit して **pull せずに push** する。
リモートが先に進んでいると `fetch first` で失敗する（2026-09-05 に前例あり）。

```bash
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm pull --rebase --autostash origin main
```

確認:

```bash
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm log -1 --oneline
# docs: Mac on-chain recovery + Windows ops checklist… などが HEAD にあれば OK
```

### W2. pool cron の flock 修正（原因 1 の本番適用）

`install-vps-crontab.sh` を再実行するか、既存 crontab を sed で直す。

**方法 A（推奨・再インストール）:**

```bash
sudo -u hyperpool /opt/hyperpool/hyper_evm/scripts/cron/install-vps-crontab.sh
```

**方法 B（その場で置換）:**

```bash
crontab -u hyperpool -l > /tmp/ct.bak
sed -E "s#(flock -n [^ ]+) (POOL_KEY=)#\1 env \2#" /tmp/ct.bak > /tmp/ct.new
diff /tmp/ct.bak /tmp/ct.new   # pool 12 行に env が入ったことを目視
crontab -u hyperpool /tmp/ct.new
```

正しい行の形:

```
… flock -n /opt/hyperpool/locks/….lock env POOL_KEY=ubtc-whype /opt/hyperpool/…/run-daily-harvest-vps.sh
```

誤った行（修正前）:

```
… flock -n ….lock POOL_KEY=ubtc-whype /opt/hyperpool/…/run-….sh
# → flock: failed to execute POOL_KEY=ubtc-whype: No such file or directory
```

### W3. スモークテスト

```bash
sudo -u hyperpool flock -n /opt/hyperpool/locks/test.lock env POOL_KEY=ubtc-whype /bin/echo OK
# → OK と出れば flock+env は通る

# ログに flock エラーが消えていること（翌朝以降）
sudo tail -n 50 /var/log/hyperpool/daily.log
```

任意で 1 pool だけ手動 harvest（本番送金あり・注意）:

```bash
sudo -u hyperpool env HYPERPOOL_ENV_FILE=/etc/hyperpool/env POOL_KEY=ubtc-whype \
  /opt/hyperpool/hyper_evm/scripts/cron/run-daily-harvest-vps.sh
```

### W4. （任意）RPC フェイルオーバー

公開 RPC の rate limit 対策。2026-09-05 から stash 未適用のまま。

```bash
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm stash list
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm stash apply stash@{0}
```

コンフリクトしたら無理に apply せず、stash 内容を確認してから。

### Windows でやらなくてよいこと

| 作業 | 理由 |
|---|---|
| オンチェーン WHYPE 送金 / 手動 rebalance | 開発 Mac で完了済み |
| Vercel 再デプロイ | main push で自動ビルド済み |
| 開発 Mac の crontab を触る | 停止済みのまま維持 |

---

## 残課題（コード / 別案件）

### 1. オンチェーン復旧 — **実施済み**（上記「開発 Mac で実施したこと」）

### 2. ProjectXAdapter.rebalance() の恒久対策 (要デプロイ)

deposit 経路と同じスワップ調整を rebalance 経路にも入れるのが本筋。
アダプタ (または vault) の再デプロイと資金移行が要るので別案件。
cron が直って keeper が 6 時間ごとに回れば、片側 100% になる前に再センタリングされるので、
当面この詰み状態には入らない。

### 3. RPC フェイルオーバーが未適用

Windows 依頼 W4 参照。

### 4. 新規入金者の Cashdrop 対象化

`vaultShareHolders` に載っていない新規入金者がいる (totalSupply の約 98%)。
ここは壊れていない。`assertShareholderSyncComplete` が不足を検出して
Transfer ログスキャンにフォールバックするので、次の harvest 実行時に自動で拾われる
（**W2 の crontab 修正後**に初めて自動 harvest が動く）。

## 関連ファイル

Windows バンドル `C:\Users\keiohigh2nd\Downloads\hyperpool-windows-bundle\` 内
（パッチ適用済みなら本リポジトリの pull だけで足りる）:

- `_apply-pool-fixes.sh` - crontab 修正 + パッチ適用 + commit/push を一括実行
- `_fix-pools-2026-09-21.patch` - 本アップデートのパッチ
- `_RECOVERY-ubtc.md` - オンチェーン復旧手順（**Mac 実施済み・再実行不要**）
- `_verify-ubtc-state.sh` - ubtc-whype の状態確認
