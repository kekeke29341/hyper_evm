# アーキテクチャ

## 概要

Hyperpool は **Project X 代理 LP + リバランス keeper** と、それを操作する Next.js フロントエンドで構成されます。Li.FI 経由のクロスチェーン入金 UI も統合されています。

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 14)                    │
│  Deposit │ Position │ Portfolio │ Cashdrop │ Affiliate       │
│  wagmi + viem │ Li.FI API proxy │ Admin panel                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ JSON-RPC / Wallet
┌──────────────────────────▼──────────────────────────────────┐
│                   HyperEVM (998 / 999)                       │
│  HyperpoolVault ──► ProjectXAdapter ──► Project X NPM       │
│  MerkleAirdrop (70% user USDC) │ Keeper rebalance +10/-30%   │
│  HyperCoreOracle (L1Read precompiles)                        │
└─────────────────────────────────────────────────────────────┘
```

## スマートコントラクト

| コントラクト | 役割 |
|-------------|------|
| `HyperpoolVault` | ERC20 シェア。USDC/HYPE 預入 → Adapter 経由で Project X LP |
| `ProjectXAdapter` | Project X NPM 向け mint / collect / rebalance（+10%/-30% ticks） |
| `MerkleAirdrop` | 日次 USDC Cashdrop — Merkle proof 請求（JST 7–9 ウィンドウ） |
| `HyperCoreOracle` | L1Read プリコンパイル経由の価格参照 |

**廃止:** `HyperpoolPair`, `HyperpoolRouter`, `HyperpoolFactory`, `PointsDistributor`

### Project X on-chain（mainnet 999）

| 名称 | アドレス |
|------|----------|
| NPM | `0xeaD19AE861c29bBb2101E834922B2FEee69B9091` |
| WHYPE/USDC pool (0.05%) | `0x6c9A33E3b592C0d65B3Ba59355d5Be0d38259285` |
| WHYPE | `0x5555555555555555555555555555555555555555` |
| USDC | `0xb88339Cb7199B77E23db6E890353E22632BA630F` |

### 手数料分配

```
collect 手数料 F (USDC)
  運営: F × 30%
  ユーザー Merkle: F × 70%（Vault シェア比例）
```

## フロントエンド

### タブ機能

| タブ | オンチェーン連携 |
|------|-----------------|
| Deposit | Li.FI bridge → USDC |
| Position | Vault deposit / withdraw |
| Portfolio | ERC20 残高、Vault シェア |
| Cashdrop | MerkleAirdrop claim（JST 7–9） |
| Affiliate | ReferralRegistry（998 デプロイ済み） |

### API Routes

| エンドポイント | 用途 |
|---------------|------|
| `GET /api/lifi/quote` | Li.FI 見積もりプロキシ（fee=0） |
| `GET /api/lifi/status` | ブリッジ TX ステータス |

## Keeper / Cron

| ジョブ | スケジュール | 処理 |
|--------|-------------|------|
| `scripts/keeper-rebalance.mjs` | 6h 推奨 | Vault `rebalance()` (+10/-30%) |
| `scripts/testnet-sync-shareholders.mjs` | daily-rewards 直前 | shares → `998.json` |
| `scripts/daily-rewards.mjs` | JST 7:00 | `harvestFees` → 30% ops / 70% Merkle |
| `scripts/testnet-run-all.sh` | 手動 | Testnet E2E 一括 |

### Testnet (998) 制約

- `MockProjectXNPM` を使用（本物 NPM なし）
- USDC 手数料 accrue 不可 → `testnet-daily-rewards-smoke.mjs` で Merkle 分配を代替検証

## ライブラリ

- `HyperCoreConstants` — チェーン ID、WHYPE/USDC アドレス
- `ProjectXConstants` — Project X pool / NPM / fee tier / range bps
