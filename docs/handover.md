# 引き継ぎ資料 (Handover)

新規担当者向けのチェックリストと、プロジェクト固有の注意事項をまとめています。

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロダクト名 | Hyperpool |
| 種別 | HyperEVM 上の AMM DEX + クロスチェーンアグリゲーター UI |
| 技術スタック | Foundry (Solidity 0.8.24) + Next.js 14 + wagmi/viem |
| フェーズ | Phase 2: EVM Aggregator (Li.FI 統合) Live |

### 主要機能

- Swap / Liquidity / Portfolio
- Points（手数料ベース、日次 100 万 PTS プール）
- Affiliate（15% referrer / 10% referee boost）
- Cashdrop（Merkle USDC エアドロップ）
- Admin パネル（`/admin`）

---

## 2. 引き継ぎチェックリスト

### Day 1 — 環境構築

- [ ] リポジトリ clone（`--recurse-submodules`）
- [ ] Foundry / Node.js 20 インストール確認
- [ ] `./scripts/health-check.sh` が pass（Anvil 除く）
- [ ] `./scripts/dev-local.sh` で localhost:3000 が表示される
- [ ] MetaMask で Anvil (31337) 接続・Swap 画面表示

### Day 2 — コードベース理解

- [ ] [architecture.md](./architecture.md) 読了
- [ ] `contracts/src/core/` の Factory / Pair / Router を把握
- [ ] `frontend/src/lib/hooks/useDeFi.ts` の主要 hook を確認
- [ ] `scripts/sync-abi.mjs` の ABI 同期フローを理解

### Day 3 — テスト & CI

- [ ] `make test` が全 pass
- [ ] GitHub Actions CI の 4 ジョブを確認
- [ ] PR 作成時に CI が走ることを確認

### 運用準備（本番前）

- [ ] `PRIVATE_KEY` / API キーの保管場所を決定（Secrets Manager 等）
- [ ] `/admin` へのアクセス制御を実装
- [ ] Mainnet デプロイ手順のリハーサル（Testnet で実施済みか確認）
- [ ] WalletConnect Project ID の本番用発行

---

## 3. 重要ファイル早見表

| やりたいこと | ファイル / コマンド |
|-------------|-------------------|
| **Testnet/本番の運営・Swap 立ち上げ** | **[docs/本番運用/](./本番運用/README.md)** |
| **アプリ概要・手数料・収益更新** | [docs/product-overview.md](./product-overview.md) |
| ローカル起動 | `./scripts/dev-local.sh` |
| Testnet デプロイ | `./scripts/deploy-testnet.sh` |
| ABI 同期 | `node scripts/sync-abi.mjs` |
| コントラクトテスト | `cd contracts && forge test` |
| フロントテスト | `cd frontend && npm run test` |
| Merkle 生成 | `frontend/src/lib/admin/merkle.ts` |
| **Admin 運用** | [docs/admin-guide.md](./admin-guide.md) |
| Li.FI 設定 | `frontend/src/lib/lifi/config.ts` |
| チェーン定数 | `contracts/src/libraries/HyperCoreConstants.sol` |
| CI 定義 | `.github/workflows/ci.yml` |
| Product 仕様原文 | `docs/cursor_instructions/platform_instruct.txt` |

---

## 4. 既知の注意点・制約

### HyperEVM 固有

1. **ガス制限** — 通常 TX は small block（3M gas）。`test_SwapGasUnderSmallBlock` で検証済み
2. **Big Block** — デプロイ時は `usingBigBlocks: true` が必要
3. **L1Read プリコンパイル** — ローカル Anvil では mock が必要（`ProjectXTest.setUp` 参照）
4. **Li.FI** — Testnet chain 998 は Li.FI 非対応。UI では mainnet 999 経由でルーティング

### 開発上の癖

1. **Anvil 状態永続化** — `contracts/anvil-state.json` があると deploy をスキップ。壊れたら削除
2. **npm peer deps** — `frontend/.npmrc` で `legacy-peer-deps=true`（wagmi 系）
3. **ABI 同期忘れ** — コントラクト変更後に sync しないと frontend が古い ABI を参照。CI が検出
4. **ネスト git 解消済み** — 以前 `contracts/` 単体 git だったが、ルートモノレポに統合

### セキュリティ

- `.env.local` / `PRIVATE_KEY` は **絶対に commit しない**
- Admin パネルは現状オープン — 本番前に要保護
- MerkleAirdrop の `fund` / `setMerkleRoot` は owner 権限

---

## 5. デプロイ済みアドレス（参考）

ローカル Anvil (31337) の最新アドレスは `contracts/deployments/31337.json` を参照。  
Testnet / Mainnet は同ディレクトリの `998.json` / `999.json`。

frontend 側コピー: `frontend/src/lib/contracts/deployments/`

---

## 6. 連絡・エスカレーション

| トピック | 確認先 |
|---------|--------|
| HyperEVM RPC / チェーン仕様 | [Hyperliquid Docs](https://hyperliquid.gitbook.io/hyperliquid-docs) |
| Li.FI 統合 | [Li.FI Docs](https://docs.li.fi) |
| OpenZeppelin Merkle | `MerkleProof` + double-hash leaf |
| UI/UX 要件 | `docs/cursor_instructions/platform_instruct.txt` |

---

## 7. 推奨次ステップ（バックログ例）

- [ ] Admin パネル認証（Basic Auth / SIWE）
- [ ] `useDeFi` hooks の Vitest カバレッジ拡充
- [ ] Mainnet 監視（Tenderly / Defender）
- [ ] Phase 3 機能の Product 定義

---

*最終更新: 2026-06-09 — Git モノレポ初期化・テスト/CI 整備後*
