# Hyperpool Admin 運用ガイド

コントラクトオーナー・keeper 向けの **Admin ダッシュボード** とオンチェーン運用の手順書です。

| 項目 | 内容 |
|------|------|
| Admin URL | `/admin`（ビルド時に `NEXT_PUBLIC_ADMIN_ENABLED=true` が必要） |
| 認可方式 | **オンチェーン owner / admin** — パスワードや Basic 認証は未実装 |
| 本番推奨 | Production では Admin **無効**、Preview / ローカルでのみ有効化 |

関連: [deployment.md](./deployment.md) · [vercel.md](./vercel.md) · [product-overview.md](./product-overview.md)

---

## 1. Admin を有効にする

### ローカル

```bash
# frontend/.env.local
NEXT_PUBLIC_ADMIN_ENABLED=true
NEXT_PUBLIC_DEFAULT_CHAIN_ID=998   # または 31337（Anvil）
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

デプロイ時、通常は **同一の deployer ウォレット** が複数役割を持ちます。移管後は役割が分かれることがあります。

| 役割 | コントラクト | 権限の例 |
|------|-------------|---------|
| **Vault Owner** | `HyperpoolVault` | `pullPendingRewards`, `recoverForeignToken`（USDC/HYPE 以外）, `pause` / `unpause`, keeper/operator 設定 |
| **Keeper** | `HyperpoolVault` | `harvestFees`, `rebalance` |
| **Airdrop Owner** | `MerkleAirdrop` | `distributeRewards`, `pause` / `unpause` |
| **Adapter Owner** | `ProjectXAdapter` | `recoverToken`（Adapter 上の idle 残高）, `setVault`, `setPool` |
| **Adapter (runtime)** | `ProjectXAdapter` | Vault のみが deposit / rebalance / collect を呼び出し |

Admin ダッシュボードは接続ウォレットが上記いずれかと一致すると **書き込みボタン** が有効になります。一致しない場合は **読み取り専用** または Access Denied です。

---

## 3. Admin UI タブ一覧

| タブ | 用途 |
|------|------|
| **Overview** | チェーン・デプロイ状態、クイック参照、Runbook リンク |
| **Analytics** | Vault TVL、Cashdrop、全コントラクトアドレス（コピー・Explorer） |
| **Pools** | Project X pool / Adapter / Vault の参照情報 |
| **Rewards** | 手数料分配、自動送金Runbook、pause |
| **Vault** | HyperpoolVault の pause、keeper、operator、range 参照 |
| **System** | ReferralRegistry と紹介定数、運用リンク |

### ネットワーク

ウォレットが **デプロイ先チェーンと異なる** と、画面上部に **ネットワーク切替バナー** が表示されます。「Switch to HyperEVM Testnet」等のボタンでウォレットを切り替えてください。

トランザクション送信後は **Tx バナー** にハッシュと Purrsec Explorer リンクが出ます。

---

## 4. よくある運用フロー

### 4.1 初回デプロイ後（Testnet）

1. `./scripts/deploy-testnet.sh` で Hyperpool デプロイ
2. `node scripts/sync-abi.mjs` → フロントの `deployments/998.json` 同期
3. `node scripts/testnet-post-deploy.mjs` → Vault 初回 deposit
4. `node scripts/testnet-sync-shareholders.mjs` → daily-rewards 用スナップショット
5. cron: `keeper-rebalance.mjs` / `daily-rewards.mjs`（または `./scripts/testnet-run-all.sh` で手動 E2E）
6. フロントを Vercel にデプロイ（`NEXT_PUBLIC_DEFAULT_CHAIN_ID=998`）

### 4.2 Cashdrop（日次USDC自動送金）

1. `daily-rewards.mjs` が Vault シェアホルダーを同期
2. `harvestFees` で LP 手数料を collect
3. 33% を `operatorWallet`、67% を `pendingUserRewards` に分離
4. `pullPendingRewards` で 67% プールを `MerkleAirdrop` へ移動
5. `distributeRewards(distributionId, accounts, amounts)` で対象ユーザーへUSDCを自動送金
6. `deployment.airdropEntries` / `lastCashdropDistribution` を更新し、フロントで直近送金額を表示

ユーザーは **Cashdrop** タブで請求しません。毎朝 JST 7:00 の運営処理で、対象ウォレットへUSDCが直接送金されます。

緊急時: **Pause claims / payouts** で自動送金を停止。

### 4.3 Vault + Keeper

- ユーザーは **Position** タブから deposit / withdraw
- Vault Owner は pause、`pullPendingRewards`（Airdrop payout contract へ USDC 送金）
- keeper は CLI: `DEPLOYMENT_CHAIN=999 node scripts/keeper-rebalance.mjs`（Testnet は `998`）
- 日次報酬: `DEPLOYMENT_CHAIN=999 node scripts/daily-rewards.mjs`
- 本番では `NEXT_PUBLIC_ADMIN_ENABLED=false` のため、Admin UI はPreview/ローカルで確認し、本番操作はCLIまたは専用運用環境から実行

Mainnet keeper 実行前チェック:

```bash
RPC=https://rpc.hyperliquid.xyz/evm
VAULT=0x2DB5FCfC0c9Eed612A544B99C9097FbBC0Cf502d
ADAPTER=0x3193AfC8FBEEDB0c2ee5B2F9Ed287579c2aa1796

cast call $VAULT 'oraclePriceUsdc6PerHype18()(uint256)' --rpc-url $RPC
cast call $ADAPTER 'currentPoolPriceUsdc6PerHype18()(uint256)' --rpc-url $RPC
cast call $ADAPTER 'positionTokenId()(uint256)' --rpc-url $RPC
```

oracle価格とProject X pool価格が大きく乖離していると `rebalance` は `PRICE_DEVIATION` でrevertします。

---

### 4.4 誤送金の回収

| 送金先 | トークン | 回収方法 |
|--------|---------|---------|
| **ProjectXAdapter** | USDC / HYPE / その他（idle 残高） | Owner → `recoverToken`（Admin **Pools** タブ） |
| **HyperpoolVault** | USDC / HYPE | **不可**（シェア担保）。`withdraw` でシェアを burn して引き出す |
| **HyperpoolVault** | その他 ERC20 | Owner → `recoverForeignToken`（Admin **Vault** タブ） |
| **MerkleAirdrop** | USDC | 回収不可。未請求分は次回 Cashdrop に繰り越し |

---

## 5. CLI との使い分け

| 作業 | Admin UI | CLI / Script |
|------|----------|--------------|
| Cashdrop 自動送金 | — | `scripts/daily-rewards.mjs` |
| デプロイ | — | `./scripts/deploy-testnet.sh` |
| Testnet E2E | — | `./scripts/testnet-run-all.sh` |
| ABI 同期 | — | `node scripts/sync-abi.mjs` |
| 株主スナップショット | — | `node scripts/testnet-sync-shareholders.mjs` |
| オンチェーン検証 | Analytics タブ | `npm run verify:testnet`（frontend） |

---

## 6. セキュリティ上の注意

1. **本番で `NEXT_PUBLIC_ADMIN_ENABLED=true` にしない**（URL が知られれば誰でも UI にアクセス可能。書き込みは owner 限定だが、情報露出・フィッシングの足がかりになる）
2. **owner ウォレットはホットウォレットにしない** — 運用用に専用ウォレット、必要最小権限
3. **owner / keeper / operator 変更** は権限喪失や報酬送金先の誤設定につながるため、十分確認してから実行
4. Cashdrop 対象者リスト・配分額は **公開リポジトリにコミットしない**（個人情報・配布額）
5. Vercel Preview の Deployment Protection を有効にし、Admin 付き Preview を社内限定に

詳細レビュー: [security-review-2026-06-12.md](./security-review-2026-06-12.md)

---

## 7. トラブルシューティング

| 症状 | 確認 |
|------|------|
| `/admin` が 404 | `NEXT_PUBLIC_ADMIN_ENABLED` と再ビルド |
| Access Denied | 接続ウォレットが owner か、チェーンが 998/999 か |
| トランザクション失敗 | ネットワークバナーで対象チェーンに切替、ガス（HYPE）残高 |
| TVL / range が不自然 | Pools / Vault タブで `ProjectXAdapter`、`projectXPool`、keeper 実行履歴を確認 |
| Project X で WHYPE/USDC が複数行 | リバランス残骸 NFT（liquidity 0）の可能性。`adapter.positionTokenId()` と NPM `positions(id).liquidity` を照合 — [architecture.md § NFT](./architecture.md#project-x-lp-ポジションと-nft技術者向け) |
| Cashdrop が 0 | `daily-rewards.mjs` 成功、`lastCashdropDistribution`、`airdropEntries` in JSON |
| `ProjectXAdapter: NOT_VAULT` | `adapter.setVault(<current vault>)` が未設定。デプロイ後設定CALLを確認 |
| `PRICE_DEVIATION` | `refPrice` と HyperCore oracle価格が5%超乖離。oracle / Project X pool価格を確認 |
| `Price slippage check` | Project X NPM mint側の価格条件。最新コントラクトではrebalance時minを0にして対応済み。古いデプロイを使っていないか確認 |
| Explorer リンクがない | Anvil (31337) は Explorer 未対応 |

---

## 8. ファイル参照

| パス | 内容 |
|------|------|
| `frontend/src/app/admin/page.tsx` | Admin ページ（有効フラグ） |
| `frontend/src/components/admin/AdminShell.tsx` | シェル・タブ |
| `frontend/src/lib/hooks/useAdmin.ts` | 認可・読取・書込 hook |
| `scripts/daily-rewards.mjs` | Cashdrop 自動送金 |
| `contracts/deployments/{chainId}.json` | デプロイアドレス |
| `docs/vercel.md` | 環境変数一覧 |

---

## 9. チェックリスト（リリース前）

- [ ] Production: `NEXT_PUBLIC_ADMIN_ENABLED=false`
- [ ] Testnet コントラクトが `998.json` と一致
- [ ] Mainnet コントラクトが `999.json` と一致
- [ ] `adapter.vault` / `adapter.pool` / `vault.swapRouter` / `airdrop.vaultShareToken` が正しい
- [ ] Mainnet deposit / harvest / rebalance smoke 済み
- [ ] `vaultShareHolders` が daily-rewards 前に sync 済み
- [ ] Cashdrop 実施時: root + fund + deadline 確認
- [ ] owner ウォレットのバックアップ・移管手順を文書化
