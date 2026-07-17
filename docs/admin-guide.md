# Hyperpool Admin 運用ガイド

コントラクトオーナー・keeper 向けの **Admin ダッシュボード** とオンチェーン運用の手順書です。

| 項目 | 内容 |
|------|------|
| Admin URL | `/admin`（ビルド時に `NEXT_PUBLIC_ADMIN_ENABLED=true` が必要） |
| 権限 | **完全読み取り専用**（2026-07 以降） — UI からのトランザクション送信機能は撤去済み。入出金・pause・回収などはすべて CLI |
| 閲覧 | ウォレット接続不要。全タブ閲覧可（監視専用ダッシュボード） |
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

**Admin UI は誰に対しても読み取り専用**です。ウォレット接続 UI・書き込みボタンは撤去済みで、UI から資金の入出金や設定変更はできません。オンチェーン権限は CLI（cast / スクリプト）実行時にのみ使用します。

| 役割 | コントラクト | 権限の例 | 実行手段 |
|------|-------------|---------|----------|
| **Vault Owner** | `HyperpoolVault` | `pause` / `unpause`, `pullPendingRewards`, `recoverForeignToken`, keeper/operator 設定 | `cast send`（CLI のみ） |
| **Keeper** | `HyperpoolVault` | `harvestFees`, `rebalance`, `deployIdle` | `scripts/daily-rewards.mjs` / `scripts/keeper-rebalance.mjs` |
| **Airdrop Owner** | `MerkleAirdrop` | `distributeRewards`, `pause` / `unpause` | `scripts/daily-rewards.mjs` / `cast send` |
| **Adapter Owner** | `ProjectXAdapter` | `recoverToken`, `setVault`, `setPool`, `setRangeBps` | `cast send`（CLI のみ） |
| **閲覧者（全員）** | — | — | Admin UI 全タブ（読み取り専用） |

---

## 3. Admin UI タブ一覧

全タブ読み取り専用（監視のみ）:

| タブ | 用途 |
|------|------|
| **Overview** | チェーン・デプロイ状態、直近アクティビティ、クイックジャンプ、Runbook リンク |
| **Activity** | **資金・ユーザーの動き** — Vault deposit / withdraw、harvest、Cashdrop 送金をオンチェーンイベントから時系列表示（合計フロー・アクティブウォレット数付き） |
| **Health** | Vault / Cashdrop 停止状態、oracle↔pool 乖離、LP レンジ内外、最終 Cashdrop、設定値 |
| **Analytics** | Vault TVL、Cashdrop 残高、全コントラクトアドレス（コピー・Explorer） |
| **Pools** | Project X pool / Adapter / Vault の参照 |
| **Rewards** | 手数料分配（7/60/33）、daily-rewards Runbook |
| **Airdrop** | Cashdrop ステータス・残高・legacy merkle 参照 |
| **Vault** | シェア供給・総資産・価格・レンジ・keeper / operator アドレス |
| **System** | keeper / operator / 手数料設定の参照、ReferralRegistry 定数 |

### ネットワーク

ウォレットが **デプロイ先チェーンと異なる** と、画面上部に **ネットワーク切替バナー** が表示されます（監視データの参照先を揃えるため）。

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
3. **7%** → `operatorWallet`（運営・即時送金）、**33%** → `ownerFeeWallet`（オーナー・即時送金）、**60%** → `pendingUserRewards`
4. `pullPendingRewards` → `MerkleAirdrop`
5. `distributeRewards(distributionId, accounts, amounts)` で自動送金
6. `deployment.lastCashdropDistribution` / `airdropEntries` を更新 → **Health タブ** で確認

緊急時（自動送金の停止）は CLI で:

```bash
cast send $AIRDROP 'pause()' --rpc-url $RPC --private-key $AIRDROP_OWNER_KEY
```

### 4.2b 運営手数料の引出し（7%）

運営分は Vault にロックされず、**`harvestFees` 実行時に `operatorWallet` へ USDC が即時送金**されます。専用のコントラクト関数は不要です。

| 資金 | 運営が引出できる？ | 方法 |
|------|-------------------|------|
| 運営分（7%） | ✅ | `operatorWallet` の USDC を MetaMask 等で通常送金 |
| ユーザー分（60%） | ❌ | `pullPendingRewards` は Airdrop 宛てのみ |
| オーナー分（33%） | ❌ | `ownerFeeWallet` へ直接送金（別ウォレット） |

**注意:** harvest 前は手数料が LP 内にあり、運営ウォレットには未入金。JST 7:00 の `daily-rewards.mjs` が動いていることを確認すること。Mainnet 現行 Vault は旧比率（33% 運営）のまま — 引出しの仕組みは同じ。

Mainnet `operatorWallet` の確認:

```bash
cast call $VAULT 'operatorWallet()(address)' --rpc-url https://rpc.hyperliquid.xyz/evm
cast call $VAULT 'operatorFeeBps()(uint256)' --rpc-url https://rpc.hyperliquid.xyz/evm
```

### 4.3 Vault + Keeper

- ユーザーは **Deposit / Liquidity** タブから deposit / withdraw
- **Health タブ** で oracle↔pool 乖離・LP レンジを監視、**Activity タブ** で入出金を確認
- Keeper: `DEPLOYMENT_CHAIN=999 node scripts/keeper-rebalance.mjs` / `daily-rewards.mjs`
- Owner の `pause` / `unpause`（入出金緊急停止）は `cast send $VAULT 'pause()'`

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
| **ProjectXAdapter** | idle 残高 | Adapter owner → `cast send $ADAPTER 'recoverToken(address,address,uint256)' …` |
| **HyperpoolVault** | USDC / HYPE | **不可** — `withdraw` でシェア burn |
| **HyperpoolVault** | その他 ERC20 | Vault owner → `cast send $VAULT 'recoverForeignToken(address,address,uint256)' …` |
| **MerkleAirdrop** | USDC | 回収不可 — 次回 Cashdrop に繰越 |

（Admin UI からの回収操作は撤去済み — owner キーによる CLI 実行のみ）

---

## 5. CLI との使い分け

Admin UI は **監視専用**、状態を変える操作はすべて CLI / Script です。

| 作業 | Admin UI | CLI / Script |
|------|----------|--------------|
| 資金フロー・ユーザー動向 | **Activity** タブ | `cast logs` |
| 死活・価格乖離・LP 監視 | **Health** タブ | `cast call` / verify スクリプト |
| Cashdrop 自動送金 | 履歴表示のみ | `scripts/daily-rewards.mjs` |
| harvest / rebalance | 表示のみ | `scripts/keeper-rebalance.mjs` / `daily-rewards.mjs` |
| pause / unpause・keeper / operator 変更・誤送金回収 | 表示のみ | `cast send`（owner キー） |
| cron 実行状況 | — | Mac cron ログ / GitHub Actions |
| デプロイ | — | `./scripts/deploy-testnet.sh` |
| Adapter `setPool` / `setRangeBps` | — | cast / デプロイスクリプト |
| ABI 同期 | — | `node scripts/sync-abi.mjs` |

---

## 6. セキュリティ上の注意

1. **本番で `NEXT_PUBLIC_ADMIN_ENABLED=true` にしない**（読み取り専用でもアドレス・TVL・資金フローが露出）
2. **Admin UI にはトランザクション送信コードが存在しない** — 万一 UI が漏れても資金操作は不可能。ただし監視情報の露出は避ける
3. **owner ウォレットはホットウォレットにしない**
4. **keeper** は harvest / rebalance のみ — pause や operator 変更は不可
5. Cashdrop 対象者リストは **公開リポジトリにコミットしない**
6. Vercel Preview の Deployment Protection を有効に

---

## 7. トラブルシューティング

| 症状 | 確認 |
|------|------|
| `/admin` が 404 | `NEXT_PUBLIC_ADMIN_ENABLED=true` を設定して再ビルド（Vercel は再デプロイ） |
| Activity が空 | RPC の `eth_getLogs` 制限 — Refresh を押す。スキャン範囲は直近ブロックのみ |
| `PRICE_DEVIATION` | **Health** タブの oracle↔pool 乖離（5% 超） |
| LP がレンジ外 | **Health** タブ「LP in range: Out of range」 |
| Cashdrop 履歴が古い | `daily-rewards.mjs` 成功 → git push → redeploy |
| Vault の緊急停止 | `cast send $VAULT 'pause()'`（owner キー、CLI のみ） |

---

## 8. ファイル参照

| パス | 内容 |
|------|------|
| `frontend/src/app/admin/page.tsx` | Admin ページ（有効フラグ） |
| `frontend/src/components/admin/AdminShell.tsx` | シェル・タブ |
| `frontend/src/components/admin/panels/HealthPanel.tsx` | 監視ダッシュボード |
| `frontend/src/components/admin/panels/ActivityPanel.tsx` | 資金フロー・ユーザー動向タイムライン |
| `frontend/src/lib/admin/activity.ts` | オンチェーンイベントのスキャン hook |
| `frontend/src/lib/hooks/useAdmin.ts` | 読取専用 hook（書き込み機能は撤去済み） |
| `frontend/src/lib/admin/health.ts` | 価格乖離・tick 判定 |
| `scripts/daily-rewards.mjs` | Cashdrop 自動送金 |
| `contracts/deployments/{chainId}.json` | デプロイアドレス |

---

## 9. チェックリスト（リリース前）

- [ ] Production: `NEXT_PUBLIC_ADMIN_ENABLED=false`
- [ ] Preview / ローカル: Health タブで oracle↔pool・LP レンジを確認
- [ ] Activity タブで直近の deposit / withdraw / Cashdrop が表示されること
- [ ] CLI で pause / unpause をテスト（`cast send $VAULT 'pause()'` → `'unpause()'`）
- [ ] CLI で harvest / rebalance をテスト（`daily-rewards.mjs` / `keeper-rebalance.mjs`）
- [ ] `lastCashdropDistribution` が Health に反映されること
- [ ] Mainnet: `vaultShareHolders` sync 済み
