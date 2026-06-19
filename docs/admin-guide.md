# Hyperpool Admin 運用ガイド

コントラクトオーナー・ファクトリ管理者向けの **Admin ダッシュボード** とオンチェーン運用の手順書です。

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
| **Vault Owner** | `HyperpoolVault` | `pullPendingRewards`, `pause` / `unpause`, keeper/operator 設定 |
| **Keeper** | `HyperpoolVault` | `harvestFees`, `rebalance` |
| **Airdrop Owner** | `MerkleAirdrop` | `setMerkleRoot`, `fund`, `pause` / `unpause`, `recoverUnclaimed` |
| **Adapter** | `ProjectXAdapter` | Vault のみが deposit / rebalance / collect を呼び出し |

Admin ダッシュボードは接続ウォレットが上記いずれかと一致すると **書き込みボタン** が有効になります。一致しない場合は **読み取り専用** または Access Denied です。

---

## 3. Admin UI タブ一覧

| タブ | 用途 |
|------|------|
| **Overview** | チェーン・デプロイ状態、クイック参照、Runbook リンク |
| **Analytics** | TVL 近似、プール残高、エポック、全コントラクトアドレス（コピー・Explorer） |
| **Pools** | ペア作成、ポイント用プール authorize、Factory `syncPairs` |
| **Points** | 日次プール定数、エポック、配布ルール（参照） |
| **Airdrop** | Merkle ルート生成・設定、資金投入、pause、期限後の回収 |
| **Vault** | Phase 3 Vault の pause、keeper、表示用 range |
| **System** | Factory 設定（feeCollector / pointsDistributor / router / feeToSetter 移管）、紹介定数 |

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

### 4.2 Cashdrop（Merkle エアドロップ）

1. 対象者リストを CSV で用意（1行 = `address,amount`、USDC は **6 decimals** の整数）
   ```
   0x70997970C51812dc3A010C7d01b50e0d17dc79C8,1000000000
   ```
2. Admin → **Airdrop** → CSV を貼り付け → **Preview Root** で検証
3. **Generate & Set Root**（ウォレット署名）
4. **Approve & Fund** で MerkleAirdrop に USDC を送る
5. ユーザーはアプリの **Cashdrop** タブから請求（`airdropEntries` が deployment JSON にあるアドレスのみフロントが証明を組み立て可能）

期限後: **Recover unclaimed** で残高を指定アドレスへ回収。

緊急時: **Pause claims** で請求を停止。

### 4.3 新しい LP ペアをポイント対象にする

1. Factory Admin で **Create Pair**（または CLI でデプロイ済み）
2. Points Owner で **Authorize**（プール = Pair コントラクトアドレス）
3. スワップ手数料が記録されると、そのプール経由の fee がポイントに反映

### 4.4 Factory 設定変更後

`setFeeCollector` や `setPointsDistributor` を変更したら、**Pools → Sync All Pairs** で既存ペアへ設定を反映してください。

### 4.5 Vault + Keeper

- ユーザーは **Position** タブから deposit / withdraw
- Vault Owner は pause、`pullPendingRewards`（MerkleAirdrop へ USDC 送金）
- keeper は CLI: `DEPLOYMENT_CHAIN=998 node scripts/keeper-rebalance.mjs`
- 日次報酬: `DEPLOYMENT_CHAIN=998 node scripts/daily-rewards.mjs`（事前に `testnet-sync-shareholders.mjs`）

---

## 5. CLI との使い分け

| 作業 | Admin UI | CLI / Script |
|------|----------|--------------|
| Merkle ルート計算 | Airdrop タブ（`merkle.ts` と同じロジック） | `frontend/src/lib/admin/merkle.ts` |
| デプロイ | — | `./scripts/deploy-testnet.sh` |
| Testnet E2E | — | `./scripts/testnet-run-all.sh` |
| ABI 同期 | — | `node scripts/sync-abi.mjs` |
| 株主スナップショット | — | `node scripts/testnet-sync-shareholders.mjs` |
| オンチェーン検証 | Analytics タブ | `npm run verify:testnet`（frontend） |

---

## 6. セキュリティ上の注意

1. **本番で `NEXT_PUBLIC_ADMIN_ENABLED=true` にしない**（URL が知られれば誰でも UI にアクセス可能。書き込みは owner 限定だが、情報露出・フィッシングの足がかりになる）
2. **owner ウォレットはホットウォレットにしない** — 運用用に専用ウォレット、必要最小権限
3. **feeToSetter 移管**（System タブ）は取り消し不可 — 十分確認してから実行
4. Merkle CSV は **公開リポジトリにコミットしない**（個人情報・配布額）
5. Vercel Preview の Deployment Protection を有効にし、Admin 付き Preview を社内限定に

詳細レビュー: [security-review-2026-06-12.md](./security-review-2026-06-12.md)

---

## 7. トラブルシューティング

| 症状 | 確認 |
|------|------|
| `/admin` が 404 | `NEXT_PUBLIC_ADMIN_ENABLED` と再ビルド |
| Access Denied | 接続ウォレットが owner か、チェーンが 998/999 か |
| トランザクション失敗 | ネットワークバナーで Testnet に切替、ガス（HYPE）残高 |
| プールにポイントが付かない | Pools タブで pair が **authorized** か |
| Cashdrop が 0 | Merkle root 設定済み・fund 済み・`airdropEntries` in JSON |
| Explorer リンクがない | Anvil (31337) は Explorer 未対応 |

---

## 8. ファイル参照

| パス | 内容 |
|------|------|
| `frontend/src/app/admin/page.tsx` | Admin ページ（有効フラグ） |
| `frontend/src/components/admin/AdminShell.tsx` | シェル・タブ |
| `frontend/src/lib/hooks/useAdmin.ts` | 認可・読取・書込 hook |
| `frontend/src/lib/admin/merkle.ts` | Merkle ツリー |
| `contracts/deployments/{chainId}.json` | デプロイアドレス |
| `docs/vercel.md` | 環境変数一覧 |

---

## 9. チェックリスト（リリース前）

- [ ] Production: `NEXT_PUBLIC_ADMIN_ENABLED=false`
- [ ] Testnet コントラクトが `998.json` と一致
- [ ] `vaultShareHolders` が daily-rewards 前に sync 済み
- [ ] Cashdrop 実施時: root + fund + deadline 確認
- [ ] owner ウォレットのバックアップ・移管手順を文書化
