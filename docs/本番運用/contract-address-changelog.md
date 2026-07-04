# コントラクトアドレス変更履歴（Mainnet 999）

**本番アプリが参照するアドレスを変えたとき**は、必ずこのファイルに **日時・理由・新旧アドレス・アプリ反映状況** を追記する。

| 項目 | 正本（ソース・オブ・トゥルース） |
|------|----------------------------------|
| アプリ / cron が使うアドレス | `frontend/src/lib/contracts/deployments/999.json` |
| オンチェーン運用・スクリプト | `contracts/deployments/999.json`（通常はフロントと同期） |
| 変更の説明・経緯 | **このファイル** |

---

## 現在アクティブ（アプリ本番）

**最終確認: 2026-06-30** — 大口ホルダーの旧 Vault 引出し完了まで、アプリは旧スタックのまま。

| 役割 | アドレス | 備考 |
|------|----------|------|
| **HyperpoolVault**（アプリ） | `0xe5f4d055c5e2d29f26862a543377c2525a41dde8` | 0.05% pool / fee=500 |
| **ProjectXAdapter**（アプリ） | `0x462e71b9e66414a2108d35ba6790428a8a046ca4` | |
| **Project X pool**（アプリ） | `0x6c9A33E3b592C0d65B3Ba59355d5Be0d38259285` | 0.05% |
| MerkleAirdrop | `0x67d45f8535ec3f268f1acb0fe69ec87ad7aa7431` | 継続利用 |
| ReferralRegistry | `0xd3439a2b33b48f7ddaa45cd2f0f89de12e36c806` | 継続利用 |
| HyperCoreOracle | `0xad6b05b0b4c79264c32136842945f321f58ef94c` | 継続利用 |

本番 UI: https://hyper-evm-ten.vercel.app（`git` の `999.json` が旧 Vault を指している限り、上記アドレスで動作）

---

## オンチェーンのみ存在（アプリ未切替）

デプロイ済みだが **フロントの `999.json` は未更新・Vercel 本番未デプロイ** のスタック。

| 役割 | アドレス | 備考 |
|------|----------|------|
| 新 HyperpoolVault | `0xF749790D37cc125B6F5d2BC5a64B56577a26d394` | 0.3% pool / fee=3000、`totalSupply` 0 |
| 新 ProjectXAdapter | `0xa6CCDC039e09889ed6E7ee8377e384F0772b706a` | |
| Project X pool (0.3%) | `0x422e586C906eb241f784B4F5a633c2C7e59A2F54` | |

詳細手順: [vault-redeploy-999.md](./vault-redeploy-999.md)

---

## 変更履歴

### 2026-06-30 — 0.3% プール用スタックをオンチェーンデプロイ（アプリは旧アドレス維持）

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-06-30 |
| **理由** | Project X 0.3% プールへ移行するため（`adapter.fee` / `vault.adapter` は immutable のため新デプロイ） |
| **アプリ反映** | **未実施** — 大口ホルダーが旧 Vault からアプリ経由で withdraw するまで `999.json` を変えない |
| **Vercel 本番** | **未デプロイ**（`git` HEAD は旧 Vault） |

**旧 → 新（Vault / Adapter / Pool）**

| 役割 | 旧 | 新 |
|------|----|----|
| HyperpoolVault | `0xe5f4d055c5e2d29f26862a543377c2525a41dde8` | `0xF749790D37cc125B6F5d2BC5a64B56577a26d394` |
| ProjectXAdapter | `0x462e71b9e66414a2108d35ba6790428a8a046ca4` | `0xa6CCDC039e09889ed6E7ee8377e384F0772b706a` |
| Project X pool | `0x6c9A33E3b592C0d65B3Ba59355d5Be0d38259285` (0.05%) | `0x422e586C906eb241f784B4F5a633c2C7e59A2F54` (0.3%) |

**その他オンチェーン変更（アプリ切替時に要確認）**

| 項目 | 変更内容 |
|------|----------|
| MerkleAirdrop `vaultShareToken` | 新 Vault `0xF749…` を指すよう更新済み（Cashdrop 用。Vault withdraw UI とは別） |
| 旧 Vault `pause` | 一時 unpause あり。引出し待ちのため pause 解除状態で運用中の期間あり |

**関連スクリプト:** `scripts/migrate-pool-3000.mjs`, `scripts/complete-pool-3000-migration.mjs`

---

### 2026-06 — Mainnet Vault 再デプロイ（idle-token NAV 修正）

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-06（コミット `d4eaea2`） |
| **理由** | idle-token NAV 修正版 Vault |
| **アプリ反映** | 実施済み（当時の `999.json` が `0xe5f4…` を指すよう更新） |

| 役割 | アドレス |
|------|----------|
| HyperpoolVault | `0xe5f4d055c5e2d29f26862a543377c2525a41dde8` |
| ProjectXAdapter | `0x462e71b9e66414a2108d35ba6790428a8a046ca4` |

---

## 追記テンプレート（コピー用）

```markdown
### YYYY-MM-DD — タイトル

| 項目 | 内容 |
|------|------|
| **実施日** | YYYY-MM-DD |
| **理由** | |
| **アプリ反映** | 未実施 / 実施済み（コミット hash・Vercel デプロイ日時） |
| **Vercel 本番** | 未デプロイ / デプロイ済み |

| 役割 | 旧 | 新 |
|------|----|----|
| HyperpoolVault | | |
| ProjectXAdapter | | |
| Project X pool | | |

**備考:**
```

## アプリ切替チェックリスト

`999.json` の `hyperpoolVault` を変えるとき:

1. このファイルの「現在アクティブ」と履歴を更新
2. `contracts/deployments/999.json` と `frontend/src/lib/contracts/deployments/999.json` を同期
3. `node scripts/sync-abi.mjs`
4. git commit → Vercel `hyper-evm` 本番デプロイ（`.cursorrules` 参照）
5. [vault-redeploy-999.md](./vault-redeploy-999.md) の移行状態を更新
