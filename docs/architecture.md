# アーキテクチャ

## 概要

Hyperpool は **Project X 代理 LP + リバランス keeper** と、それを操作する Next.js フロントエンドで構成されます。Li.FI 経由のクロスチェーン入金 UI も統合されています。

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 14)                    │
│  Dashboard │ Bridge │ Position │ Cashdrop │ Affiliate       │
│  wagmi + viem │ Li.FI API proxy │ Admin panel                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ JSON-RPC / Wallet
┌──────────────────────────▼──────────────────────────────────┐
│                   HyperEVM (998 / 999)                       │
│  HyperpoolVault ──► ProjectXAdapter ──► Project X NPM       │
│  MerkleAirdrop (67% user USDC) │ Keeper rebalance +10/-30%   │
│  HyperCoreOracle (L1Read precompiles)                        │
└─────────────────────────────────────────────────────────────┘
```

## スマートコントラクト

| コントラクト | 役割 |
|-------------|------|
| `HyperpoolVault` | ERC20 シェア。USDC/HYPE 預入 → Adapter 経由で Project X LP |
| `ProjectXAdapter` | Project X NPM 向け mint / collect / rebalance（+10%/-30% ticks） |
| `MerkleAirdrop` | 日次 USDC Cashdrop — 運営処理による自動送金（JST 7:00） |
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
  運営: F × 33%
  ユーザー自動送金: F × 67%（Vault シェア比例）
```

## Project X LP ポジションと NFT（技術者向け）

Hyperpool 利用者が NFT を直接扱う必要はありません。以下は **Project X 連携・keeper 運用・エクスプローラ確認** 向けの説明です。

### LP ポジション = NPM 上の ERC721（NFT）

Project X の集中流動性（Uniswap V3 型）は **NPM（Nonfungible Position Manager）** 経由で管理されます。各レンジ付き LP は **固有の `tokenId` を持つ ERC721 NFT** として発行されます（画像コレクション用途ではなく、ポジション所有権のデータ構造です）。

| レイヤー | ユーザーが持つもの | 実体 |
|---------|-------------------|------|
| Hyperpool UI | Vault シェア `hp-VAULT`（ERC20） | `HyperpoolVault` の残高 |
| オンチェーン LP | （直接は見えない） | `ProjectXAdapter` が保持する NPM NFT |
| Project X エクスプローラ | WHYPE/USDC ポジション行 | Adapter アドレス配下の NFT 一覧 |

関連コード: `contracts/src/core/ProjectXAdapter.sol`（`positionTokenId`）、`contracts/src/interfaces/IProjectXNPM.sol`

### 預入先プールは 1 本のみ

運用上の LP 先は **WHYPE/USDC 0.05% tier の 1 プール** に固定です（mainnet: `ProjectXConstants.POOL_WHYPE_USDC_MAINNET`）。UI 表示名は `HYPE/USDC` ですが、オンチェーンは WHYPE です。kHYPE 等の別ペアへ同時に LP しているわけではありません。

### リバランスのオンチェーンフロー

keeper が `HyperpoolVault.rebalance(refPrice)` を呼ぶと、Adapter 内で次の順序で処理されます（`ProjectXAdapter.rebalance`）:

1. 現在の `positionTokenId` に対し `decreaseLiquidity`（流動性をすべて除去）
2. 参照価格と +10% / −30% bps から新 tick を計算
3. 手元トークンで `npm.mint` → **新しい `tokenId` を発行**
4. `positionTokenId` を新 ID に更新

**tick レンジは既存 NFT を書き換えられない** ため、リバランス = 「旧ポジション解消 + 新ポジション mint」が V3 型の標準パターンです。

keeper CLI: `scripts/keeper-rebalance.mjs`（6h 推奨）

### Project X 上で WHYPE/USDC が複数行見える理由

リバランス後も **流動性ゼロの旧 NFT は NPM 上に残ります**（現行 Adapter は `burn` を呼んでいません）。そのため Project X / エクスプローラでは、同じペアの LP が複数行表示されることがあります。

| 表示 | 意味 |
|------|------|
| 流動性 0 の行 | 過去リバランスで使い終わった NFT（残骸） |
| 流動性 > 0 の行 | 現在有効なポジション（`adapter.positionTokenId()`） |

**正しく実装・運用されていれば資金上の問題はありません。** 有効な資産は常に最新の `positionTokenId` に集約され、Vault の `totalAssetsUsdc()` / ユーザーシェア価値と一致する必要があります。

確認コマンド例（viem / cast）:

- `ProjectXAdapter.positionTokenId()` — 現役 NFT ID
- `ProjectXAdapter.tickLower()` / `tickUpper()` — 現レンジ
- NPM `positions(tokenId)` — 各 NFT の `liquidity`（0 なら残骸）

### 正しさの不変条件（レビュー・運用チェック）

1. **単一の有効ポジション** — Adapter が追跡する `positionTokenId` は常に 1 つ。deposit / withdraw / harvest はその ID を参照
2. **残骸 NFT に資金なし** — 旧 tokenId の `liquidity == 0`、かつ未 collect の手数料が意図せず残っていないこと（rebalance 前に `collectFees` 運用を推奨）
3. **Vault NAV** — `totalAssetsUsdc()` は pending user rewards を除いた純資産。シェア価格と UI 表示が乖離しないこと
4. **プール固定** — mainnet では `projectXPool` / `setPool` が 0.05% WHYPE/USDC を指していること

### フロントエンド表示（Position タブ）

同一ペア `HYPE/USDC 0.05%` が UI 上 2 カードある場合があります。これは **別プールではなく役割分担** です:

| カード | 内容 |
|--------|------|
| **私の流動性** | ユーザーの Vault シェアに紐づくポジション（価値・レンジ） |
| **プール概要** | Project X プール全体の参考指標（TVL・参考 APY 等） |

リバランス履歴パネルは **keeper のオンチェーンイベントではなく**、ポジション作成時に `localStorage` へ記録したクライアント側履歴です（`frontend/src/lib/liquidity/history.ts`）。

### 将来の改善余地（任意）

- リバランス後、流動性 0 の旧 NFT を NPM `burn` で破棄 → Project X UI の行数を整理
- リバランス / harvest イベントを subgraph または RPC ログから UI に反映

現状の「残骸 NFT」は **ガス代の無駄（将来 mint 時の NFT 枚数）** 程度であり、ユーザー資金の二重計上にはなりません。

## フロントエンド

### タブ機能

| タブ | オンチェーン連携 |
|------|-----------------|
| Dashboard | Cashdrop 自動送金履歴、Vault シェア価値 |
| Bridge | Li.FI bridge → HyperEVM USDC（mainnet 999） |
| Position | Vault deposit / withdraw |
| Cashdrop | 自動送金額・履歴の確認 |
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
| `scripts/daily-rewards.mjs` | JST 7:00 | `harvestFees` → 33% ops / 67% user auto payout |
| `scripts/testnet-run-all.sh` | 手動 | Testnet E2E 一括 |

### Testnet (998) 制約

- `MockProjectXNPM` を使用（本物 NPM なし）
- USDC 手数料 accrue 不可 → `testnet-daily-rewards-smoke.mjs` でCashdrop分配を代替検証

## ライブラリ

- `HyperCoreConstants` — チェーン ID、WHYPE/USDC アドレス
- `ProjectXConstants` — Project X pool / NPM / fee tier / range bps
