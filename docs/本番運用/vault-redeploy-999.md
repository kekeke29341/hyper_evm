# Mainnet Vault 再デプロイ（999）— 7/60/33 手数料分配

2026-06-30 に `MigratePool3000.s.sol` で新 Vault スタックをオンチェーンデプロイ済み。**手数料 7% 運営 / 60% ユーザー / 33% オーナー** が有効。

> **アプリのコントラクトアドレスは未切替**（2026-06-30 時点）。本番 UI は旧 Vault `0xe5f4…` を参照。日時・アドレスの正本は [contract-address-changelog.md](./contract-address-changelog.md)。

## コントラクトアドレス

| 役割 | アドレス |
|------|----------|
| **新 HyperpoolVault** | `0xF749790D37cc125B6F5d2BC5a64B56577a26d394` |
| **新 ProjectXAdapter** (fee=3000 / 0.3% pool) | `0xa6CCDC039e09889ed6E7ee8377e384F0772b706a` |
| **旧 HyperpoolVault**（pause 済み） | `0xe5f4d055c5e2d29f26862a543377c2525a41dde8` |
| **旧 ProjectXAdapter** (fee=500) | `0x462e71b9e66414a2108d35ba6790428a8a046ca4` |
| MerkleAirdrop（継続利用） | `0x67d45f8535ec3f268f1acb0fe69ec87ad7aa7431` |
| ReferralRegistry（継続利用） | `0xd3439a2b33b48f7ddaa45cd2f0f89de12e36c806` |
| Project X pool (0.3%) | `0x422e586C906eb241f784B4F5a633c2C7e59A2F54` |

## オンチェーン手数料設定（新 Vault）

| パラメータ | 値 |
|-----------|-----|
| `operatorFeeBps` | 700（7%）→ `operatorWallet` |
| `ownerFeeBps` | 3300（33%）→ `ownerFeeWallet` |
| ユーザー Cashdrop プール | 60%（`pendingUserRewards`） |
| `operatorWallet` | `0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC` |
| `ownerFeeWallet` | `0x6300B420377119e66A133D0aCf19061eA540FcDD` |

確認:

```bash
VAULT=0xF749790D37cc125B6F5d2BC5a64B56577a26d394
RPC=https://rpc.hyperliquid.xyz/evm
cast call $VAULT 'operatorFeeBps()(uint256)' --rpc-url $RPC
cast call $VAULT 'ownerFeeBps()(uint256)' --rpc-url $RPC
cast call $VAULT 'ownerFeeWallet()(address)' --rpc-url $RPC
```

## デプロイ手順（再実行時）

```bash
# 1. 新 adapter + vault（immutable なのでフル再デプロイ）
OLD_VAULT=0xe5f4d055c5e2d29f26862a543377c2525a41dde8 \
  node scripts/migrate-pool-3000.mjs

# 2. adapter.setVault / setPool / airdrop.setVaultShareToken / fee split 等
node scripts/complete-pool-3000-migration.mjs

# 3. 旧 Vault から資金移行 + 新 Vault で初回 LP
node scripts/migrate-funds-pool-3000.mjs

# 4. deployment JSON 同期
node scripts/sync-abi.mjs
```

## ユーザー資金の移行（必須）

旧 Vault にシェアが残っている間は **新 Vault で LP が動きません**。

1. 運営が旧 Vault を一時 `unpause()`（`scripts/unpause-old-vault-for-migration.mjs`）
2. 各シェアホルダーが旧 Vault で `withdraw`
3. 新 Vault で `depositUSDC` / `depositHYPE`
4. keeper が `rebalance`（または `scripts/keeper-rebalance.mjs`）
5. 全員移行後、旧 Vault を `pause()`（`complete-pool-3000-migration.mjs`）

**2026-06-30 時点:** 旧 Vault に約 64.9M シェア（`0xf35208bf…`）が残存。新 Vault の `totalSupply` は 0。

## 運営手数料の引出し

harvest 後、運営分（7%）は `operatorWallet` に即時送金。通常の USDC 送金で引出可。詳細は [運営確認事項.md](./運営確認事項.md)「運営手数料の引出し」。

## cron / スクリプト

`daily-rewards.mjs` / `keeper-rebalance.mjs` は `contracts/deployments/999.json` の **新 `hyperpoolVault`** を参照すること。Vercel 本番も `frontend/src/lib/contracts/deployments/999.json` を redeploy して反映。
