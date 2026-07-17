# 手元 Mac で keeper / 日次 Cashdrop（暫定運用）

GitHub Actions が使えない間、**24 時間起動の Mac** で cron を回します。  
本番公開前の Testnet 運用・開発向け。**本番移行先は VPS を推奨**（[external-cron.md](./external-cron.md) · [vps-cron.md](./vps-cron.md)）。

---

## 前提

| 項目 | 内容 |
|------|------|
| OS | macOS |
| スリープ | オフ（システム設定 → エネルギー） |
| 秘密鍵 | `.env.testnet` の `MAIN_PRIVATE_KEY` |
| Node | 20+ |
| git push | daily-rewards 後に自動送金結果 JSON を push → Vercel 再デプロイ |

---

## セットアップ（1 回）

```bash
cd /path/to/hyper_evm
./scripts/cron/install-mac-crontab.sh
```

手動テスト:

```bash
./scripts/cron/run-keeper-local.sh
./scripts/cron/run-daily-rewards-local.sh   # 自動送金結果 JSON を git push する
```

---

## スケジュール

| 時刻 | スクリプト | 処理 |
|------|-----------|------|
| 毎日 JST 7:00 | `run-daily-harvest-local.sh` | 株主 sync → harvest（手数料回収） |
| 毎日 JST 9:00 / 9:30 | `run-daily-distribute-local.sh` | share-seconds 計算 → distributeRewards 自動送金 → JSON push（9:30 は取りこぼし再試行） |
| 6 時間ごと | `run-keeper-local.sh` | LP リバランス (+10% / −30%) |

7:00 harvest と 9:00 distribute に分け、9:30 に再試行を入れることで、初回フルスキャンや RPC 遅延で harvest が長引いても distribute がスキップされにくくします。

手動で一括実行する場合:

```bash
./scripts/cron/run-daily-rewards-local.sh   # harvest + distribute 連続
```

## RPC チューニング（Mainnet 999）

| 環境変数 | 公開 RPC | 専用 RPC（`MAINNET_RPC`） |
|----------|----------|---------------------------|
| `LOG_CHUNK_SIZE` | 100 | 500 |
| `LOG_CHUNK_DELAY_MS` | 800 | 300 |
| `SKIP_LOG_SCAN` | 1（既知ホルダー） | 1 |

`MAINNET_RPC` を `.env.mainnet` に設定すると自動で大きいチャンクを使います。株主 discovery は checkpoint 以降の増分スキャン + 既知アドレスの `balanceOf` です。

## 失敗通知

Mac では cron 失敗時にデスクトップ通知（`CRON_MACOS_NOTIFY=1`、デフォルト有効）。`/tmp/hyperpool-daily.log` も確認してください。

ログ:

```bash
tail -f /tmp/hyperpool-keeper.log
tail -f /tmp/hyperpool-daily.log
```

---

## 解除

```bash
crontab -l | awk '
  />>> hyperpool cron begin >>>/ { skip=1; next }
  /<<< hyperpool cron end <<</ { skip=0; next }
  skip { next }
  { print }
' | crontab -
```

---

## 制約・リスク

- Mac 再起動・スリープ・停電で cron が止まる
- `git push` には GitHub 認証が必要（SSH または gh auth）
- daily-rewards は対象者へ直接USDC送金するため、失敗時は `/tmp/hyperpool-daily.log` で Tx、`distributionId`、Airdrop残高を確認
- 同じ配分の再実行は `distributionExecuted` で拒否され、二重送金を防止
- Mainnet 公開時は **VPS への移行を推奨**（Mac cron のまま本番公開しない）

関連: [external-cron.md](./external-cron.md) · [vps-cron.md](./vps-cron.md) · [github-actions-cron.md](./github-actions-cron.md) · [チェックリスト.md](./チェックリスト.md)
