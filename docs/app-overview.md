# Hyperpool アプリ説明

このドキュメントは **「Hyperpool とは何か」「何ができるか」「どう動いているか」** を一通り説明する入口資料です。  
手数料・ポイントの詳細は [product-overview.md](./product-overview.md)、技術構成は [architecture.md](./architecture.md) を参照してください。

---

## 1. 一言で言うと

**Hyperpool** は、Hyperliquid の EVM レイヤー（**HyperEVM**）上で動く **コミュニティ主導の DEX（分散型取引所）** です。

- ブラウザ + ウォレット（MetaMask 等）だけでスワップ・流動性提供・ポイント獲得ができる
- フロントは **Next.js**、取引ロジックは **スマートコントラクト（Solidity）** が担当
- **VC 資金なし・100% セルフファンド** をコンセプトに UI でも明示

---

## 2. 誰のためのアプリか

| ユーザー像 | 利用シーン |
|-----------|-----------|
| HyperEVM / kHYPE ユーザー | kHYPE ↔ USDC などのスワップ、LP で手数料収益 |
| クロスチェーン利用者 | Ethereum / Arbitrum / Base 等から Li.FI 経由で HyperEVM へブリッジ |
| コミュニティ参加者 | スワップ手数料に連動するポイント、紹介プログラム |
| エアドロップ対象者 | Cashdrop（Merkle 証明）で USDC を請求 |

---

## 3. 画面（タブ）でできること

フロントエンドのメイン UI は次のタブで構成されています（英語 UI の表記）。

| タブ | できること |
|------|-----------|
| **Swap** | 同一チェーン内スワップ（例: kHYPE → USDC）。Li.FI 経由のクロスチェーンスワップ・ブリッジ |
| **Position** | V2 型 LP の作成・追加・削除。Phase 3 の **Liquidity Vault**（単一トークン Zap、シェア管理） |
| **Portfolio** | ウォレット残高・LP トークン保有の一覧、紹介コードの入力（+10% ポイントブースト） |
| **Cashdrop** | Merkle エアドロップ（USDC）の請求 |
| **Points** | 手数料連動ポイントの確認、リーダーボード、日次 Claim |
| **Affiliate** | 紹介コードの発行・管理（紹介者 +15% / 被紹介者 +10% ボーナス） |
| **Admin** (`/admin`) | プール・ポイント・エアドロップの運用（本番では無効化または厳格なアクセス制御） |

### Phase 3: Liquidity Vault（概要）

`HyperpoolLiquidityVault` により、ユーザーは次のような流れで LP に参加できます。

1. kHYPE または USDC を **Vault に預ける**（Zap）
2. Vault が Router 経由でプールに LP を追加し、**Vault シェア** をユーザーに付与
3. 引き出し時はシェアを burn し、プールから kHYPE / USDC を受け取る（スリッページ保護付き）

詳細はコントラクト `contracts/src/core/HyperpoolLiquidityVault.sol` とフロントの `VaultPanel` / `LiquidityTab` を参照。

---

## 4. 技術のざっくり構成

```
ユーザー（ブラウザ + ウォレット）
        │
        ▼
┌───────────────────────────────┐
│  Frontend (Next.js 14)        │
│  frontend/                    │
│  · wagmi / viem               │
│  · Li.FI API プロキシ         │
└───────────────┬───────────────┘
                │ JSON-RPC
                ▼
┌───────────────────────────────┐
│  HyperEVM                     │
│  Chain 998 (Testnet)          │
│  Chain 999 (Mainnet)          │
│                               │
│  Router → Factory → Pair(AMM) │
│  Points / Referral / Airdrop  │
│  Liquidity Vault              │
└───────────────────────────────┘
```

| レイヤー | 場所 | 役割 |
|---------|------|------|
| UI | `frontend/src/` | タブ、ウォレット接続、見積もり表示、トランザクション送信 |
| コントラクト | `contracts/src/core/` | スワップ・LP・ポイント・エアドロップ・Vault |
| デプロイ情報 | `contracts/deployments/{chainId}.json` | チェーンごとのコントラクトアドレス |
| ABI | `frontend/src/lib/contracts/abis/` | フロントがコントラクトを呼ぶための定義（`sync-abi.mjs` で同期） |

---

## 5. 対応ネットワーク

| 環境 | Chain ID | 用途 |
|------|----------|------|
| Anvil Local | 31337 | ローカル開発（`./scripts/dev-local.sh`） |
| HyperEVM Testnet | 998 | テスト・デモ（現状の主なデプロイ先） |
| HyperEVM Mainnet | 999 | 本番（デプロイ手順は [deployment.md](./deployment.md)） |

Testnet のコントラクトアドレスは `contracts/deployments/998.json` に記載されています。

---

## 6. アプリの動作に必要なもの / 不要なもの

### 必要なもの（ランタイム）

| 要素 | 説明 |
|------|------|
| **デプロイ済みコントラクト** | HyperEVM 上に Factory / Router / Pair 等が存在すること |
| **RPC** | フロントが残高・見積もりを読むため（例: Hyperliquid Testnet RPC） |
| **フロントのホスティング** | 例: Vercel（GitHub push で自動ビルド・公開） |
| **ユーザーのウォレット** | MetaMask 等でトランザクション署名 |

### 不要なもの（品質保証用）

| 要素 | 説明 |
|------|------|
| **GitHub Actions** | push 時の自動テスト。**アプリの本番動作には不要**（課金ロック等で止まっても Vercel + チェーン上のコントラクトは別途動く） |
| **ローカル Anvil** | 本番利用者には不要。開発者のみ |

---

## 7. リポジトリのディレクトリ

```
hyper_evm/
├── contracts/          # Solidity（Foundry）
│   ├── src/core/       # 本番コントラクト
│   ├── test/           # Forge テスト
│   ├── script/         # デプロイスクリプト
│   └── deployments/    # チェーン別アドレス JSON
├── frontend/           # Next.js アプリ（Vercel の Root Directory）
│   ├── src/components/ # UI（タブ、Vault、Admin 等）
│   └── src/lib/hooks/  # useDeFi, useWallet 等
├── scripts/            # デプロイ・ABI 同期・テストネット用
└── docs/               # 本ドキュメントを含む各種資料
```

---

## 8. 手数料の要点（詳細は別 doc）

| 種別 | 率・内容 |
|------|---------|
| DEX スワップ | 0.30%（うち 86% が LP、14% がプロトコル） |
| Li.FI ブリッジ | Hyperpool アグリゲーター手数料 **0%**（ガス・ルート手数料は別） |
| LP 追加・削除 | DEX 手数料は発生しない（mint/burn） |
| ポイント | スワップ手数料量と **1:1** で記録（Claim は手動） |

→ 計算例・エポック・UI の更新間隔は [product-overview.md](./product-overview.md)

---

## 9. 公開・デプロイの流れ（運用者向け）

| 対象 | 方法 | ドキュメント |
|------|------|-------------|
| **フロント UI** | GitHub → Vercel 連携（Root: `frontend`） | [vercel.md](./vercel.md) |
| **コントラクト** | `forge script` + `finalize-deployment.mjs` | [deployment.md](./deployment.md) |
| **ABI 同期** | `node scripts/sync-abi.mjs` | [architecture.md](./architecture.md) |

Testnet 向けクイックデプロイ:

```bash
./scripts/deploy-testnet.sh
```

---

## 10. 関連ドキュメント

| 読みたい内容 | ファイル |
|-------------|---------|
| **手数料・ポイント・収益更新の詳細** | [product-overview.md](./product-overview.md) |
| システム構成・コントラクト一覧 | [architecture.md](./architecture.md) |
| ローカルで動かす | [development.md](./development.md) |
| テストネット / 本番デプロイ | [deployment.md](./deployment.md) |
| Vercel 公開 | [vercel.md](./vercel.md) |
| テスト・CI | [testing.md](./testing.md) |
| 引き継ぎチェックリスト | [handover.md](./handover.md) |
| セキュリティレビュー記録 | [security-review-2026-06-12.md](./security-review-2026-06-12.md) |

---

## 11. よくある質問

**Q. GitHub Actions が失敗しているとアプリは使えない？**  
A. いいえ。Actions は開発時の自動テスト用です。Vercel 上のフロントと HyperEVM 上のコントラクトが生きていれば、ユーザーは通常どおり利用できます。

**Q. ウォレットを接続しないと何ができる？**  
A. タブ閲覧・見積もり表示（プールに流動性がある場合）などは可能です。スワップ・LP・Claim は接続と署名が必要です。

**Q. 「Position」と「Liquidity」の表記**  
A. UI 上のタブ名は **Position**（ポジション管理・Vault・LP）。コントラクトや一部コードでは `liquidity` という ID が残っています。

**Q. 本番 URL は？**  
A. Vercel プロジェクトの Production ドメイン（または `*.vercel.app`）。Deployment Protection を有効にしている場合はチームログインが必要です。設定は [vercel.md](./vercel.md) を参照。
