# デプロイガイド

## フロントエンド（Vercel）

Testnet / 本番 UI は Vercel にデプロイします。詳細は **[vercel.md](./vercel.md)**。

- Root Directory: `frontend`
- コントラクト ABI / `998.json` はリポジトリに同梱（**変更後は Redeploy 必須**）
- `PRIVATE_KEY` は Vercel に設定しない

## Testnet（コントラクト · Chain 998）

`.env.testnet` に `MAIN_PRIVATE_KEY` を設定:

```bash
source scripts/testnet-env.sh
./scripts/deploy-testnet.sh
```

デプロイ内容: `HyperpoolVault`, `ProjectXAdapter`, `HyperCoreOracle`, `MerkleAirdrop`, `ReferralRegistry`, `MockProjectXNPM`（998）

デプロイ後（スクリプト内で自動実行されるが、手動でも可）:

```bash
node scripts/finalize-deployment.mjs 998
node scripts/sync-abi.mjs
```

初回 Vault セットアップ:

```bash
node scripts/testnet-post-deploy.mjs
node scripts/testnet-sync-shareholders.mjs
```

既存スタックに `ReferralRegistry` だけ追加する場合:

```bash
source scripts/testnet-env.sh
./scripts/deploy-referral-registry.sh 998
```

## Mainnet（Chain 999）

```bash
source scripts/testnet-env.sh   # または .env.mainnet
./scripts/deploy-mainnet.sh
```

本番では **本物 Project X NPM** を使用（Mock なし）。

## デプロイ後

```bash
node scripts/sync-abi.mjs
git add contracts/deployments frontend/src/lib/contracts/deployments
git commit -m "Update deployment state"
git push
# → Vercel Production Redeploy
```

## 運用スクリプト

| スクリプト | 用途 |
|-----------|------|
| `scripts/deploy-referral-registry.sh` | Deploy ReferralRegistry only |
| `scripts/keeper-rebalance.mjs` | Keeper rebalance |
| `scripts/daily-rewards.mjs` | harvest + Merkle |
| `scripts/testnet-run-all.sh` | Testnet E2E 一括 |

詳細: [本番運用/テストネット運用.md](./本番運用/テストネット運用.md)
