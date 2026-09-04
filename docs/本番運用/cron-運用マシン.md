# 定期実行（cron）— 運用マシンについて

**開発用 Mac では cron を回さない。** keeper / Cashdrop の定期実行は **別マシン** が担当する。

最終更新: 2026-09-04

---

## 現状（重要）

| 場所 | 役割 |
|------|------|
| **開発 Mac（このリポジトリを Cursor で触るマシン）** | コード・デプロイ・手動検証のみ。**crontab は空**（2026-09-04 に全停止） |
| **運用マシン（別マシン）** | `keeper-rebalance.mjs` / `daily-rewards.mjs` を cron で実行 |

二重実行すると Cashdrop JSON の競合や不要な rebalance tx が増える。**同じ `MAIN_PRIVATE_KEY` で 2 台同時に cron を入れないこと。**

---

## 運用マシンが実行すべきジョブ（Mainnet 999）

スクリプト本体はリポジトリ共通。運用マシンは `POOL_KEY` 付きで呼ぶ。

### HYPE建てプール（必須）

| 時刻 (JST) | 処理 | 例 |
|------------|------|-----|
| 7:10 / 9:10 / 9:40 | harvest / distribute / retry | `POOL_KEY=upump-whype` |
| 7:20 / 9:20 / 9:50 | 同上 | `POOL_KEY=ubtc-whype` |
| 7:30 / 9:30 / 10:00 | 同上 | `POOL_KEY=ueth-whype` |
| 毎 6h（:15 / :30 / :45） | keeper rebalance | 各 `POOL_KEY` + `SKIP_ORACLE=1` |

テンプレ: [`scripts/cron/hyperpool.example.crontab`](../../scripts/cron/hyperpool.example.crontab)  
インストーラ: [`scripts/cron/install-vps-crontab.sh`](../../scripts/cron/install-vps-crontab.sh)（VPS） / Mac 用は [`install-mac-crontab.sh`](../../scripts/cron/install-mac-crontab.sh)（**開発 Mac では使わない**）

### Legacy HYPE/USDC gen9（任意・明示判断）

`POOL_KEY` **なし** の harvest / distribute / keeper。  
デフォルトのインストーラでは **入れない**。再開する場合のみ `INSTALL_LEGACY_HYPE_USDC_CRON=1`。

---

## 運用マシンのセットアップ手順（参照先）

どちらのマシンでも、呼ぶスクリプトは同じ（`keeper-rebalance.mjs` / `daily-rewards.mjs`）。ロジックの二重実装は禁止。

| 環境 | 手順書 |
|------|--------|
| **Windows Server + WSL2** | [windows-server-wsl2-cron.md](./windows-server-wsl2-cron.md) |
| **Linux VPS** | [vps-cron.md](./vps-cron.md) |
| 候補比較 | [external-cron.md](./external-cron.md) |
| HYPE建て追加時の注意 | [hype建てプール追加手順.md](./hype建てプール追加手順.md) |

必須 env（運用マシン側、git に含めない）:

- `MAIN_PRIVATE_KEY`（または `PRIVATE_KEY`）
- `DEPLOYMENT_CHAIN=999`
- 各ジョブの `POOL_KEY=ueth-whype|ubtc-whype|upump-whype`

---

## 開発 Mac でやってよいこと / 禁止

| してよい | してはいけない |
|----------|----------------|
| `forge` / フロント開発 / Vercel デプロイ | `./scripts/cron/install-mac-crontab.sh` |
| 手動 1 回だけ `POOL_KEY=… node scripts/keeper-rebalance.mjs`（明示時） | 無人 crontab の常設 |
| ログ確認・RPC 読み取り | 運用マシンと同時に cron 起動 |

開発 Mac の crontab を誤って入れた場合の解除:

```bash
crontab -l | awk '
  />>> hyperpool cron begin >>>/ { skip=1; next }
  /<<< hyperpool cron end <<</ { skip=0; next }
  skip { next }
  { print }
' | crontab -
# 空なら: crontab -r
```

---

## アプリとの関係

- ユーザー向け UI: https://hyper-evm-ten.vercel.app （メイン = HYPE/USDC、`/pools` = HYPE建て）
- cron はオンチェーン harvest / rebalance と `deployments/999.json` の Cashdrop 更新を担当
- UI は JSON / チェーンを読むだけ。cron が止まると **新規手数料の Cashdrop と LP リバランスが止まる**（預入・引出自体は可能）
