# Hyperpool プロダクト概要

Hyperpool は **Project X 上の WHYPE/USDC プールへ代理 LP** し、**+10% / −30% レンジを keeper がリバランス**するマネージド流動性サービスです。自前 DEX（HyperpoolPair）は提供しません。

技術詳細は [architecture.md](./architecture.md)、UI 原文は [cursor_instructions/platform_instruct.txt](./cursor_instructions/platform_instruct.txt) を参照してください。

---

## 1. このアプリは何か

**Hyperpool** は HyperEVM 上で動作する **代理 LP + リバランス** サービスです。Web フロント（Next.js）からウォレット接続だけで以下を行えます。

| 機能 | 説明 |
|------|------|
| **Dashboard** | Vault シェア価値と Cashdrop claim 履歴の確認 |
| **Bridge** | Li.FI 経由で任意チェーンから HyperEVM USDC へブリッジ |
| **Position** | USDC / HYPE を Vault に預ける（運営が Project X へ代理 LP） |
| **Cashdrop** | 毎朝 JST 7:00–9:00、collect 手数料の **70%** を USDC で Merkle 請求 |
| **Affiliate** | 紹介コード — Cashdrop 分配時に +10% / +15% 反映 |
| **Admin** (`/admin`) | Merkle ルート・Vault 運用 |

### コンセプト

- **LP を自前で作らない** — 預け先は [Project X](https://www.prjx.com/) WHYPE/USDC（0.05% プール）
- **コア価値 = リバランス + 代理運用**（+10% 上限 / −30% 下限）
- **収益分配**: collect した LP 手数料の **30% 運営 / 70% ユーザー**（日次 USDC）
- APR 表示: Project X 参考 APY（グロス）+ 脚注「実質還元 ≒ 参考 APY × 70%」

### 対象ユーザー

- USDC だけ持っていて HYPE レンジ LP を運営に任せたいユーザー
- 他チェーンから HyperEVM へ資金を移して参加したいユーザー

---

## 2. 手数料・収益の内訳

### 2.1 Project X LP 手数料（本体）

| 項目 | 内容 |
|------|------|
| 収益源 | Project X WHYPE/USDC プールの **取引手数料**（0.05% tier） |
| 運営取り分 | collect 手数料の **30%** |
| ユーザー還元 | collect 手数料の **70%**（Vault シェア比例、JST 7–9 USDC Cashdrop） |
| リバランス | keeper が +10% / −30% 非対称レンジを維持 |

### 2.2 クロスチェーンブリッジ（Li.FI）

| 項目 | 率 | 備考 |
|------|-----|------|
| Hyperpool アグリゲーター手数料 | **0%** | API `fee=0` 固定 |
| スリッページ | デフォルト 0.5% | 設定で変更可 |
| ガス / ブリッジ | ルート依存 | Li.FI 見積もり表示 |

### 2.3 Vault 預入 / 引出

| 操作 | 手数料 |
|------|--------|
| Vault deposit / withdraw | DEX 手数料なし（ガスのみ） |
| ブリッジ → USDC → Vault | Li.FI + ガス |

---

## 3. 毎日の USDC 還元（Cashdrop）

1. **JST 7:00** — keeper / cron が Project X ポジションから `collect`
2. **30%** → 運営ウォレット
3. **70%** → Vault シェア比例で Merkle root 構築 → MerkleAirdrop に fund
4. **JST 7:00–9:00** — ユーザーが Cashdrop タブで claim

ポイントシステム（PointsDistributor）は **廃止** しました。

---

## 4. ユーザーが必要なもの

| 参加方法 | 必要なもの |
|----------|-----------|
| 推奨 | HyperEVM 上の **USDC** のみ |
| 代替 | **HYPE（WHYPE）** + ガス用 native HYPE |
| 他チェーン | 任意トークン → Li.FI ブリッジ → USDC → Vault |

**不要:** Project X で手動 LP、自前 Pair への Zap、ポイント請求。

---

## 5. 関連ドキュメント

- [architecture.md](./architecture.md) — コントラクト・keeper 構成
- [hyperpool-guide.html](./hyperpool-guide.html) — ユーザー向け完全ガイド
- [testing.md](./testing.md) — テスト手順
