# GitHub Actions で keeper / 日次 Cashdrop を回す

Vercel は UI のみ。**keeper リバランス**と**日次 harvest → Cashdrop** は GitHub Actions で定期実行します。  
workflow はリポジトリ内にあるため、Cursor から追加・修正できます。

| Workflow | ファイル | スケジュール | 処理 |
|----------|---------|-------------|------|
| Hyperpool Keeper | `.github/workflows/hyperpool-keeper.yml` | 6 時間ごと (UTC) | `scripts/keeper-rebalance.mjs` |
| Hyperpool Daily Rewards | `.github/workflows/hyperpool-daily-rewards.yml` | 毎日 22:00 UTC (= JST 7:00) | `scripts/daily-rewards.mjs` + JSON commit |

手動実行: GitHub → **Actions** → 該当 workflow → **Run workflow**（chain 998 / 999 を選択）。

---

## 1. 初回セットアップ（10 分）

### 1.1 GitHub Environment を作る

**Settings → Environments → New environment**

| Environment 名 | 用途 |
|----------------|------|
| `hyperpool-998` | Testnet |
| `hyperpool-999` | Mainnet（デプロイ後） |

まず **hyperpool-998** だけで OK。

### 1.2 Secret（必須）

Environment `hyperpool-998`（および将来 `hyperpool-999`）に追加:

| Secret 名 | 内容 |
|-----------|------|
| `HYPERPOOL_PRIVATE_KEY` | keeper / owner ウォレットの秘密鍵（`0x` 付きでも可） |

- ガス用 HYPE が入っているウォレットにすること
- Vault の keeper 権限があること（deployer デフォルト）
- **Vercel には置かない**

### 1.3 Variables（推奨）

**Repository → Settings → Secrets and variables → Actions → Variables**

| Variable 名 | Testnet (998) | Mainnet (999) |
|-------------|---------------|---------------|
| `HYPERPOOL_CHAIN` | `998` | `999`（切替時） |
| `HYPERPOOL_RPC_URL` | `https://rpcs.chain.link/hyperevm/testnet` | `https://rpc.hyperliquid.xyz/evm` |
| `HYPERPOOL_SKIP_ORACLE` | `1` | （空または未設定） |

Environment 単位で Variable を上書きしてもよい（998 だけ `SKIP_ORACLE=1` 等）。

### 1.4 デフォルト chain

スケジュール実行は Repository Variable **`HYPERPOOL_CHAIN`**（未設定時は `998`）を使います。  
Mainnet 公開後は `999` に変更。

---

## 2. 動作の流れ

```
【Keeper — 6h ごと】
  GitHub Actions → keeper-rebalance.mjs → Vault.rebalance()

【Daily — JST 7:00】
  GitHub Actions → daily-rewards.mjs
    → harvestFees / Merkle / setMerkleRoot
    → 998.json / 999.json を commit & push
    → Vercel が main ブランチを再デプロイ
    → ユーザーが Cashdrop タブで claim 可能
```

`pendingUserRewards = 0` の日は harvest のみ走り、JSON 変更がなければ commit はスキップされます。

---

## 3. 料金（有料プランでも問題になりにくい）

| 項目 | 目安 |
|------|------|
| Keeper | 約 2 分 × 4 回/日 ≒ 240 分/月 |
| Daily | 約 3 分 × 1 回/日 ≒ 90 分/月 |
| **合計** | **約 330 分/月** |

- 無料枠: プライベート repo で **2,000 分/月**（Organization プランは別）
- 超過分: 約 **$0.008/分**（Linux runner）

この 2 workflow だけなら無料枠内に収まることが多いです。有料プランでも cron 用に大きな追加費用は通常不要です。

---

## 4. ブランチ保護

Daily Rewards が JSON を `main` に push するため:

- **Settings → Branches → Branch protection** で `github-actions[bot]` の push を許可する  
  または
- Required reviewers がある場合は、bot 用の bypass / PAT 運用を検討

push できないと **オンチェーン Merkle は設定されるが UI の claim 用 JSON が更新されない** 状態になります。

---

## 5. Testnet の注意

998 では本物 USDC 手数料 harvest が 0 になる日があります。その場合:

```bash
source scripts/testnet-env.sh
POOL_USDC=0.01 node scripts/testnet-daily-rewards-smoke.mjs
```

を手動または別 workflow で実行（本番 999 では通常 `daily-rewards.mjs` のみ）。

---

## 6. Mainnet 切替チェックリスト

- [ ] `999.json` に `deployed: true` と Vault アドレス
- [ ] Environment `hyperpool-999` に `HYPERPOOL_PRIVATE_KEY`
- [ ] `HYPERPOOL_CHAIN=999`、`HYPERPOOL_SKIP_ORACLE` を削除
- [ ] Actions で workflow_dispatch から 999 を手動テスト
- [ ] スケジュール有効化を確認

---

## 7. トラブルシュート

| 症状 | 確認 |
|------|------|
| `Set PRIVATE_KEY` | Secret `HYPERPOOL_PRIVATE_KEY` が Environment にあるか |
| `not deployed` | 該当 chain の deployment JSON |
| Oracle price unavailable (999) | RPC / oracle、`REF_PRICE_USDC6` |
| push failed | Branch protection / `contents: write` |
| Cashdrop UI に出ない | daily-rewards の commit が main に入ったか、Vercel redeploy |

関連: [チェックリスト.md](./チェックリスト.md) · [テストネット運用.md](./テストネット運用.md)
