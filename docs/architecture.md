# アーキテクチャ

## 概要

Hyperpool は HyperEVM 上の AMM DEX と、それを操作する Next.js フロントエンドで構成されます。  
Phase 2 として Li.FI プロトコル経由のクロスチェーンスワップ/ブリッジ UI も統合されています。

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 14)                    │
│  Swap │ Liquidity │ Portfolio │ Cashdrop │ Points │ Affiliate│
│  wagmi + viem │ Li.FI API proxy │ Admin panel                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ JSON-RPC / Wallet
┌──────────────────────────▼──────────────────────────────────┐
│                   HyperEVM (998 / 999)                       │
│  ProjectXRouter ──► ProjectXFactory ──► ProjectXPair (AMM)  │
│  PointsDistributor │ ReferralRegistry │ MerkleAirdrop        │
│  FeeCollector │ HyperCoreOracle (L1Read precompiles)         │
└─────────────────────────────────────────────────────────────┘
```

## スマートコントラクト

| コントラクト | 役割 |
|-------------|------|
| `ProjectXFactory` | LP ペア作成（admin のみ）、FeeCollector / PointsDistributor の同期 |
| `ProjectXPair` | Uniswap V2 型 AMM。スワップ手数料 0.3%（30 bps） |
| `ProjectXRouter` | addLiquidity / swap エントリポイント |
| `FeeCollector` | プロトコル手数料（LP 以外の 14%）受取 |
| `PointsDistributor` | 手数料ベースのポイント配布、日次エポック |
| `ReferralRegistry` | 紹介コード（15% referrer / 10% referee boost） |
| `MerkleAirdrop` | Cashdrop — Merkle proof による USDC 請求 |
| `HyperCoreOracle` | L1Read プリコンパイル経由の L1 ブロック・価格参照 |

### HyperEVM 固有

- **L1Read プリコンパイル** (`0x0800` 付近): `l1BlockNumber`, `oraclePx`, `position` 等
- **CoreWriter** (`0x3333...3333`): HyperCore への書き込み（将来拡張用）
- **ガス制限**: Small block 3M gas / Big block 30M gas — スワップは small block 内に収める設計

### ライブラリ

- `PoolMath` — AMM 計算（quote, getAmountOut, sqrt）
- `L1Read` — プリコンパイル呼び出しラッパー（gas 上限付き）
- `HyperCoreConstants` — チェーン ID、プリコンパイルアドレス、USDC/kHYPE アドレス

## フロントエンド

### 主要ディレクトリ

```
frontend/src/
├── app/              # App Router (page, API routes)
├── components/       # UI (tabs, layout, admin)
├── lib/
│   ├── contracts/    # ABI + deployment JSON（sync-abi で同期）
│   ├── hooks/        # useDeFi, useWallet, useLiFi, useAdmin
│   ├── lifi/         # Li.FI チェーン・トークン設定
│   ├── wagmi/        # ウォレット接続設定
│   └── admin/        # Merkle ツリー生成（エアドロップ管理）
└── middleware.ts
```

### API Routes

| エンドポイント | 用途 |
|---------------|------|
| `GET /api/lifi/quote` | Li.FI 見積もりプロキシ（fee=0） |
| `GET /api/lifi/status` | ブリッジ TX ステータス |

### タブ機能

| タブ | オンチェーン連携 |
|------|-----------------|
| Swap | Router swap / Li.FI bridge |
| Liquidity | Router addLiquidity, プール一覧 |
| Portfolio | ERC20 残高、LP ポジション |
| Cashdrop | MerkleAirdrop claim |
| Points | PointsDistributor 読取・claim |
| Affiliate | ReferralRegistry 読取・コード登録 |

## ABI 同期フロー

```
forge build → contracts/out/
     ↓
scripts/sync-abi.mjs
     ↓
frontend/src/lib/contracts/abis/*.json
frontend/src/lib/contracts/deployments/{chainId}.json
```

デプロイ後は必ず `node scripts/sync-abi.mjs`（または `make sync-abi`）を実行し、変更をコミットしてください。CI の `sync-abi` ジョブが差分を検出します。

## セキュリティ上の注意

- `PRIVATE_KEY` は `.env` / シェル環境変数のみ。リポジトリにコミットしない
- Admin パネル (`/admin`) は本番ではアクセス制御を追加すること
- Merkle ルート設定・fund は `MerkleAirdrop` owner のみ
