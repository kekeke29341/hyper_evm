# 2026-09-21 HYPE建てプール: cron 不発とレンジ外ポジション

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

## 残課題

### 1. オンチェーン復旧 (最優先・未実施)

`ubtc-whype` と `upump-whype` はレンジ外のままで、手数料ゼロ。
cron を直しても harvest は 0 しか取れない。**新しい送金スクリプトは不要**で、
アダプタに不足側トークンを少量入れれば、あとは既存の本番キーパーが
`rebalance` から `deployIdle` まで完了させる (deployIdle 経路はスワップ調整を持つため、
残りの UBTC は自動で約 50/50 に戻る)。

手順 1: keeper ウォレットから通常の ERC20 送金

| pool | 送り先 (adapter) | トークン | 金額 |
|---|---|---|---|
| ubtc-whype | `0x768f4909ee0de4eb9f538912904cbef8e2426e27` | WHYPE | 0.005 |
| upump-whype | `0xb03f65a9742e0e1fb4ca6064f53c8ebb22a7ef51` | WHYPE | 0.001 |

この WHYPE は vault の NAV に入る。keeper には戻せないので少額で。
0.005 WHYPE は NAV 299.3 WHYPE の約 0.0017%。

手順 2: キーパーを 1 回回す

```
sudo -u hyperpool env HYPERPOOL_ENV_FILE=/etc/hyperpool/env POOL_KEY=ubtc-whype SKIP_ORACLE=1 \
  /opt/hyperpool/hyper_evm/scripts/cron/run-keeper-vps.sh
```

手順 3: 確認

```
curl -s "https://hyper-evm-ten.vercel.app/api/pool-apr?chainId=999&poolKey=ubtc-whype"
```

`vaultInRange: true` になれば復旧。

### 2. ProjectXAdapter.rebalance() の恒久対策 (要デプロイ)

deposit 経路と同じスワップ調整を rebalance 経路にも入れるのが本筋。
アダプタ (または vault) の再デプロイと資金移行が要るので別案件。
cron が直って keeper が 6 時間ごとに回れば、片側 100% になる前に再センタリングされるので、
当面この詰み状態には入らない。

### 3. RPC フェイルオーバーが未適用

`git stash@{0}` (viem fallback 4 エンドポイント + harvestFees フォールバック) が
2026-09-05 から未適用のまま。今日も公開 RPC から `Request exceeds defined limit` を受けている。

```
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm stash apply stash@{0}
```

### 4. 新規入金者の Cashdrop 対象化

`vaultShareHolders` に載っていない新規入金者がいる (totalSupply の約 98%)。
ここは壊れていない。`assertShareholderSyncComplete` が不足を検出して
Transfer ログスキャンにフォールバックするので、次の harvest 実行時に自動で拾われる。

## 別マシンで進める場合の手順

### A. このアップデートを取り込む

```
git pull origin main
```

frontend の変更は Vercel が main から自動で再ビルドする。

### B. cron の修正は「keeper を実行しているマシン」でだけ意味がある

本番 keeper は Windows 機 (`keiohigh2nd`) の WSL Ubuntu で動いており、
Windows タスクスケジューラが legacy を、WSL crontab が pool を叩いている。
別マシンに移す場合は、そのマシンで crontab を入れ直すこと。

```
sudo -u hyperpool /opt/hyperpool/hyper_evm/scripts/cron/install-vps-crontab.sh
```

本アップデート適用後の `install-vps-crontab.sh` は `env POOL_KEY=` 形式を生成する。
既存の crontab をその場で直す場合は sed で置換する。

```
crontab -u hyperpool -l > /tmp/ct.bak
sed -E "s#(flock -n [^ ]+) (POOL_KEY=)#\1 env \2#" /tmp/ct.bak > /tmp/ct.new
crontab -u hyperpool /tmp/ct.new
sudo -u hyperpool flock -n /opt/hyperpool/locks/test.lock env POOL_KEY=ubtc-whype /bin/echo OK
```

**二重実行に注意。** 旧マシンと新マシンで同時に cron を有効にしないこと。
lock は `/opt/hyperpool/locks` のローカル flock なのでマシンをまたいだ排他はできない。
移行するなら旧マシンの crontab とタスクスケジューラを先に止める。

### C. オンチェーン復旧を実施する

上記「残課題 1」。keeper の秘密鍵 (`/etc/hyperpool/env` の `PRIVATE_KEY`) が要る。

### D. 旧 Windows 機で必ずやること

**このアップデートを push した後、旧 Windows 機の WSL リポジトリで先に pull しておくこと。**

```
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm pull --rebase --autostash origin main
```

日次 distribute は `999.json` を commit して **pull せずに push** する実装なので、
リモートが先に進んでいると翌朝の push が `fetch first` で失敗する。
2026-09-05 にこれで配布記録を取りこぼした前例がある (`docs/インシデント` 参照)。

## 関連ファイル

Windows バンドル `C:\Users\keiohigh2nd\Downloads\hyperpool-windows-bundle\` 内:

- `_apply-pool-fixes.sh` - crontab 修正 + パッチ適用 + commit/push を一括実行
- `_fix-pools-2026-09-21.patch` - 本アップデートのパッチ
- `_RECOVERY-ubtc.md` - オンチェーン復旧手順
- `_verify-ubtc-state.sh` - ubtc-whype の状態確認
