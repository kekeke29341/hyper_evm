# Hyperpool アプリ説明

このドキュメントは **「Hyperpool とは何か」「何ができるか」「どう動いているか」** を一通り説明する入口資料です。  
手数料・日次収益の詳細は [product-overview.md](./product-overview.md)、技術構成は [architecture.md](./architecture.md) を参照してください。

---

## 1. 一言で言うと

**Hyperpool** は、Hyperliquid の EVM レイヤー（**HyperEVM**）上で **[Project X](https://www.prjx.com/) WHYPE/USDC プールへ代理 LP** するマネージド流動性サービスです。

- ユーザーは **Vault に USDC / HYPE を預ける**だけ（運営が Project X 上で LP + リバランス）
- keeper が **+10% / −30%** レンジを維持
- 取引手数料の **67%** を USDC Cashdrop、**33%** を運営
- フロントは **Next.js**、取引ロジックは **スマートコントラクト（Solidity）**

自前 DEX（HyperpoolPair / Router）は **提供しません**。

---

## 2. 誰のためのアプリか

| ユーザー像 | 利用シーン |
|-----------|-----------|
| HyperEVM / HYPE ユーザー | Vault へ USDC / HYPE を deposit、部分 withdraw |
| クロスチェーン利用者 | Li.FI 経由で USDC を HyperEVM へブリッジ（mainnet 999） |
| Cashdrop 対象者 | 毎朝 JST 7:00 の自動送金で USDC を受取 |
| 運営 / keeper | リバランス cron、日次 harvest + Cashdrop 自動送金 |

---

## 3. 画面（タブ）でできること

| タブ | できること |
|------|-----------|
| **ダッシュボード** | 収益グラフ（Cashdrop 自動送金履歴） |
| **ブリッジ** | Li.FI クロスチェーンブリッジ（mainnet 999。998 非対応） |
| **ポジション** | Vault へ USDC / HYPE deposit、withdraw |
| **Cashdrop** | 日次USDC自動送金の確認 |
| **紹介** | 紹介コード（将来拡張） |
| **Admin** (`/admin`) | 運用 UI（本番では無効化推奨） |

### Vault の流れ

1. USDC または HYPE（wrap 済み WHYPE）を **HyperpoolVault** に預ける
2. Vault が **ProjectXAdapter** 経由で Project X NPM 上に LP mint（NPM 上は ERC721 NFT。ユーザーは Vault シェアのみ保持 — 詳細は [architecture.md § NFT](./architecture.md#project-x-lp-ポジションと-nft技術者向け)）
3. ユーザーは **Vault シェア（ERC20）** を受け取る
4. withdraw 時はシェア burn → 比例で USDC + WHYPE を受け取る

---

## 4. 技術のざっくり構成

```
ユーザー（ブラウザ + ウォレット）
        │
        ▼
┌───────────────────────────────┐
│  Frontend (Next.js 14)        │
│  Dashboard │ Bridge │ Position │ Cashdrop│
│  wagmi / viem │ Li.FI API     │
└───────────────┬───────────────┘
                │ JSON-RPC
                ▼
┌───────────────────────────────┐
│  HyperEVM (998 / 999)         │
│  HyperpoolVault               │
│    └─ ProjectXAdapter         │
│         └─ Project X NPM      │
│  MerkleAirdrop (67% USDC)     │
│  HyperCoreOracle              │
└───────────────────────────────┘
```

| レイヤー | 場所 | 役割 |
|---------|------|------|
| UI | `frontend/src/` | タブ、ウォレット接続、TX 送信 |
| コントラクト | `contracts/src/core/` | Vault / Adapter / Airdrop / Oracle |
| デプロイ情報 | `contracts/deployments/{chainId}.json` | チェーンごとのアドレス |
| 運用 CLI | `scripts/` | keeper / daily-rewards / testnet E2E |

---

## 5. 対応ネットワーク

| 環境 | Chain ID | 用途 |
|------|----------|------|
| Anvil Local | 31337 | ローカル開発 |
| HyperEVM Testnet | 998 | テスト・デモ（Mock NPM） |
| HyperEVM Mainnet | 999 | 本番（本物 Project X NPM） |

Testnet アドレス: `contracts/deployments/998.json`

---

## 6. アプリの動作に必要なもの

| 要素 | 説明 |
|------|------|
| **デプロイ済み Vault** | HyperEVM 上に HyperpoolVault + Adapter |
| **Vault deposit** | ユーザーが Vault に預けると Project X 既存 LP へ代理投入 |
| **keeper cron** | リバランス（+10% / −30%） |
| **RPC + Vercel** | フロント読取・TX 送信 |
| **ユーザーウォレット** | MetaMask 等 |

---

## 7. リポジトリのディレクトリ

```
hyper_evm/
├── contracts/          # Solidity（Foundry）
│   ├── src/core/       # HyperpoolVault, ProjectXAdapter 等
│   ├── test/
│   ├── script/         # DeployHyperpool.s.sol
│   └── deployments/    # 998.json / 999.json
├── frontend/           # Next.js（Vercel Root）
├── scripts/            # keeper, daily-rewards, testnet-run-all.sh
└── docs/
```

---

## 8. 手数料の要点

| 種別 | 内容 |
|------|------|
| Project X LP 手数料 | WHYPE/USDC 0.05% tier |
| ユーザー還元 | USDC 手数料の **67%**（Vault シェア比例 · Cashdrop） |
| 運営 | USDC 手数料の **33%** |
| Li.FI ブリッジ | Hyperpool 手数料 0%（ルート手数料は別） |

→ 詳細: [product-overview.md](./product-overview.md)

---

## 9. 公開・デプロイの流れ（運用者向け）

| 対象 | 方法 | ドキュメント |
|------|------|-------------|
| **フロント UI** | GitHub → Vercel | [vercel.md](./vercel.md) |
| **コントラクト** | `./scripts/deploy-testnet.sh` | [deployment.md](./deployment.md) |
| **Testnet E2E** | `./scripts/testnet-run-all.sh` | [本番運用/テストネット運用.md](./本番運用/テストネット運用.md) |

---

## 10. 関連ドキュメント

| 読みたい内容 | ファイル |
|-------------|---------|
| **Testnet 運用・スクリプト** | [本番運用/テストネット運用.md](./本番運用/テストネット運用.md) |
| 手数料・日次収益 | [product-overview.md](./product-overview.md) |
| システム構成 | [architecture.md](./architecture.md) |
| ローカル開発 | [development.md](./development.md) |
| テスト | [testing.md](./testing.md) |
| 引き継ぎ | [handover.md](./handover.md) |

---

## 11. よくある質問

**Q. Swap タブは？**  
A. 自前 DEX を廃止しました。取引は Project X 上で行われ、ユーザーは Vault 経由で LP に参加します。

**Q. Testnet で Li.FI は使える？**  
A. いいえ（chain 998 非対応）。ブリッジタブは mainnet (999) 向けです。998 では Position タブから直接 deposit してください。

**Q. 収益グラフはいつ表示される？**  
A. 毎朝の Cashdrop 自動送金イベントが同期され、ダッシュボードに反映されます。

**Q. GitHub Actions が失敗しているとアプリは使えない？**  
A. いいえ。Vercel + オンチェーンコントラクトが生きていれば利用可能です。
