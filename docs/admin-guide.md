# Hyperpool Admin 運用ガイド

コントラクトオーナー・keeper 向けの **Admin ダッシュボード** とオンチェーン運用の手順書です。

| 項目 | 内容 |
|------|------|
| Admin URL | `/admin`（ビルド時に `NEXT_PUBLIC_ADMIN_ENABLED=true` が必要） |
| 認可方式 | **オンチェーン owner / keeper / adapter owner** — パスワードや Basic 認証は未実装 |
| 閲覧 | **ウォレット未接続でも読み取り専用で全タブ閲覧可**（2026-06 以降） |
| 本番推奨 | Production では Admin **無効**、Preview / ローカルでのみ有効化 |

関連: [deployment.md](./deployment.md) · [vercel.md](./vercel.md) · [product-overview.md](./product-overview.md)

---

## 1. Admin を有効にする

### ローカル

```bash
# frontend/.env.local
NEXT_PUBLIC_ADMIN_ENABLED=true
NEXT_PUBLIC_DEFAULT_CHAIN_ID=998   # または 999 / 31337（Anvil）
```

```bash
cd frontend && npm run dev
# → http://localhost:3000/admin
```

### Vercel

| 環境 | `NEXT_PUBLIC_ADMIN_ENABLED` | 推奨 |
|------|---------------------------|------|
| Production | `false` | 公開 URL から Admin を隠す |
| Preview | `true`（任意） | チーム検証用 |
| Development | `true` | ローカル相当 |

`NEXT_PUBLIC_*` は **ビルド時に焼き込まれる**ため、変数変更後は **再デプロイ** が必要です。

ミドルウェア（`frontend/src/middleware.ts`）も `ADMIN_ENABLED=false` のとき `/admin` を `/` にリダイレクトします。

---

## 2. 誰が何をできるか（オンチェーン役割）

| 役割 | コントラクト | 権限の例 | Admin UI |
|------|-------------|---------|----------|
| **Vault Owner** | `HyperpoolVault` | `pause` / `unpause`, `pullPendingRewards`, `recoverForeignToken`, keeper/operator 設定 | Vault / System タブで書き込み |
| **Keeper** | `HyperpoolVault` | `harvestFees`, `rebalance` | Vault タブ（harvest / rebalance のみ） |
| **Airdrop Owner** | `MerkleAirdrop` | `distributeRewards`, `pause` / `unpause` | Airdrop タブ |
| **Adapter Owner** | `ProjectXAdapter` | `recoverToken`, `setVault`, `setPool`, `setRangeBps` | Pools タブ（recoverToken） |
| **任意ウォレット / 未接続** | — | — | **全タブ読み取り専用**（Health / Analytics 等） |

Admin ダッシュボードは接続ウォレットが上記 owner / keeper と一致すると **書き込みボタン** が有効になります。一致しない場合は **読み取り専用** です（Access Denied 画面は廃止）。

---

## 3. Admin UI タブ一覧

| タブ | 用途 |
|------|------|
| **Overview** | チェーン・デプロイ状態、クイックジャンプ、Runbook リンク |
| **Health** | Vault / Cashdrop 停止状態、oracle↔pool 乖離、LP レンジ内外、最終 Cashdrop、設定値 |
| **Analytics** | Vault TVL、Cashdrop 残高、全コントラクトアドレス（コピー・Explorer） |
| **Pools** | Project X pool / Adapter / Vault の参照、Adapter `recoverToken` |
| **Rewards** | 手数料分配（33/67）、daily-rewards Runbook |
| **Airdrop** | Cashdrop pause / unpause、legacy merkle 参照 |
| **Vault** | pause / unpause、harvest、rebalance、pullPendingRewards、recoverForeignToken |
| **System** | keeper / operator 設定、ReferralRegistry 定数 |

### ネットワーク

ウォレットが **デプロイ先チェーンと異なる** と、画面上部に **ネットワーク切替バナー** が表示されます。

トランザクション送信後は **Tx バナー** にハッシュと Purrsec Explorer リンクが出ます。

---

## 4. よくある運用フロー

### 4.1 初回デプロイ後（Testnet）

1. `./scripts/deploy-testnet.sh` で Hyperpool デプロイ
2. `node scripts/sync-abi.mjs` → フロントの `deployments/998.json` 同期
3. `node scripts/testnet-post-deploy.mjs` → Vault 初回 deposit
4. `node scripts/testnet-sync-shareholders.mjs` → daily-rewards 用スナップショット
5. cron: `keeper-rebalance.mjs` / `daily-rewards.mjs`
6. フロントを Vercel にデプロイ（`NEXT_PUBLIC_DEFAULT_CHAIN_ID=998`）

### 4.2 Cashdrop（日次 USDC 自動送金）

1. `daily-rewards.mjs` が Vault シェアホルダーを同期
2. `harvestFees` で LP 手数料を collect
3. 33% → `operatorWallet`、67% → `pendingUserRewards`
4. `pullPendingRewards` → `MerkleAirdrop`
5. `distributeRewards(distributionId, accounts, amounts)` で自動送金
6. `deployment.lastCashdropDistribution` / `airdropEntries` を更新 → **Health タブ** で確認

緊急時: **Airdrop タブ → Pause claims** で自動送金を停止。

### 4.3 Vault + Keeper

- ユーザーは **Deposit / Liquidity** タブから deposit / withdraw
- **Health タブ** で oracle↔pool 乖離・LP レンジを監視
- Keeper / Owner: **Vault タブ** で `harvestFees` / `rebalance`（または CLI）
- Owner: **Vault タブ** で `pause` / `unpause`（入出金緊急停止）
- CLI: `DEPLOYMENT_CHAIN=999 node scripts/keeper-rebalance.mjs` / `daily-rewards.mjs`

Mainnet keeper 実行前チェック（Admin **Health** タブでも oracle / pool 乖離を表示）:

```bash
RPC=https://rpc.hyperliquid.xyz/evm
VAULT=0x2DB5FCfC0c9Eed612A544B99C9097FbBC0Cf502d

cast call $VAULT 'oraclePriceUsdc6PerHype18()(uint256)' --rpc-url $RPC
cast call $ADAPTER 'currentPoolPriceUsdc6PerHype18()(uint256)' --rpc-url $RPC
```

### 4.4 誤送金の回収

| 送金先 | トークン | 回収方法 |
|--------|---------|---------|
| **ProjectXAdapter** | idle 残高 | Adapter owner → `recoverToken`（Admin **Pools** タブ） |
| **HyperpoolVault** | USDC / HYPE | **不可** — `withdraw` でシェア burn |
| **HyperpoolVault** | その他 ERC20 | Vault owner → `recoverForeignToken`（Admin **Vault** タブ） |
| **MerkleAirdrop** | USDC | 回収不可 — 次回 Cashdrop に繰越 |

---

## 5. CLI との使い分け

| 作業 | Admin UI | CLI / Script |
|------|----------|--------------|
| 死活・価格乖離・LP 監視 | **Health** タブ | `cast call` / verify スクリプト |
| Cashdrop 自動送金 | 履歴表示のみ | `scripts/daily-rewards.mjs` |
| cron 実行状況 | — | Mac cron ログ / GitHub Actions |
| デプロイ | — | `./scripts/deploy-testnet.sh` |
| Adapter `setPool` / `setRangeBps` | — | cast / デプロイスクリプト |
| ABI 同期 | — | `node scripts/sync-abi.mjs` |

---

## 6. セキュリティ上の注意

1. **本番で `NEXT_PUBLIC_ADMIN_ENABLED=true` にしない**（読み取り専用でもアドレス・TVL が露出）
2. **owner ウォレットはホットウォレットにしない**
3. **keeper** は harvest / rebalance のみ — pause や operator 変更は不可
4. Cashdrop 対象者リストは **公開リポジトリにコミットしない**
5. Vercel Preview の Deployment Protection を有効に

---

## 7. トラブルシューティング

| 症状 | 確認 |
|------|------|
| `/admin` が 404 | `NEXT_PUBLIC_ADMIN_ENABLED` と再ビルド |
| 書き込みボタンが無効 | owner / keeper ウォレット接続、対象チェーン |
| `PRICE_DEVIATION` | **Health** タブの oracle↔pool 乖離（5% 超） |
| LP がレンジ外 | **Health** タブ「LP in range: Out of range」 |
| Cashdrop 履歴が古い | `daily-rewards.mjs` 成功 → git push → redeploy |
| Vault pause 忘れ | **Vault** タブの Emergency セクション |

---

## 8. ファイル参照

| パス | 内容 |
|------|------|
| `frontend/src/app/admin/page.tsx` | Admin ページ（有効フラグ） |
| `frontend/src/components/admin/AdminShell.tsx` | シェル・タブ |
| `frontend/src/components/admin/panels/HealthPanel.tsx` | 監視ダッシュボード |
| `frontend/src/lib/hooks/useAdmin.ts` | 認可・読取・書込 hook |
| `frontend/src/lib/admin/health.ts` | 価格乖離・tick 判定 |
| `scripts/daily-rewards.mjs` | Cashdrop 自動送金 |
| `contracts/deployments/{chainId}.json` | デプロイアドレス |

---

## 9. チェックリスト（リリース前）

- [ ] Production: `NEXT_PUBLIC_ADMIN_ENABLED=false`
- [ ] Preview / ローカル: Health タブで oracle↔pool・LP レンジを確認
- [ ] Vault owner で pause / unpause をテスト
- [ ] Keeper で harvest / rebalance をテスト（または CLI）
- [ ] `lastCashdropDistribution` が Health に反映されること
- [ ] Mainnet: `vaultShareHolders` sync 済み
