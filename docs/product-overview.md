# Project X プロダクト概要

このドキュメントでは、**Project X がどんなアプリか**、**手数料の内訳**、**毎日の収益（ポイント）がどう更新されるか**を説明します。  
技術詳細は [architecture.md](./architecture.md)、UI 要件原文は [cursor_instructions/platform_instruct.txt](./cursor_instructions/platform_instruct.txt) を参照してください。

---

## 1. このアプリは何か

**Project X（PRJX）** は、HyperEVM 上で動作する **コミュニティ主導の AMM DEX（分散型取引所）** です。  
Web フロントエンド（Next.js）から、ウォレット接続だけで以下を行えます。

| 機能 | 説明 |
|------|------|
| **Swap** | 同一チェーン内のトークンスワップ（例: kHYPE ↔ USDC） |
| **Bridge / Swap** | Li.FI 経由のクロスチェーン送金・スワップ（Ethereum / Arbitrum / Base 等 → HyperEVM） |
| **Liquidity** | LP として流動性を預け、取引手数料の一部を獲得 |
| **Portfolio** | ウォレット残高・LP ポジションの確認 |
| **Points** | スワップで発生した手数料に連動するポイントの確認・請求 |
| **Affiliate** | 紹介コードの発行・入力。紹介者・被紹介者双方にポイントボーナス |
| **Cashdrop** | Merkle 証明による USDC エアドロップ請求 |
| **Admin** (`/admin`) | プール・ポイント・エアドロップの運用（本番では要アクセス制御） |

### コンセプト

- HyperEVM エコシステム向け DEX（Phase 2: Li.FI クロスチェーン対応）
- **100% セルフファンド** — VC・シードラウンドなし（UI にも明記）
- ポイントは「預けた金額」より **「発生させた取引手数料」** に強く連動

### 対象ユーザー

- HyperEVM / kHYPE エコシystem でスワップ・LP をしたいトレーダー
- 紹介プログラムでポイントを稼ぎたいユーザー
- 他チェーンから HyperEVM へブリッジしたいユーザー

---

## 2. 手数料の内訳（いくらかかるか）

手数料は **取引の種類** によって異なります。ガス代は HyperEVM / 送信元チェーンのネットワーク状況により変動します。

### 2.1 同一チェーン DEX スワップ（Project X プール）

コントラクト `ProjectXPair` で定義されています。

| 項目 | 率 | 備考 |
|------|-----|------|
| **スワップ手数料（総額）** | **0.30%** | 入力トークン量 × 0.3%（`SWAP_FEE_BPS = 30`） |
| うち LP 還元 | **86%** | プール残高に留まり、LP トークン保有者のシェアが増える |
| うちプロトコル | **14%** | `FeeCollector` コントラクトへ送金 |

#### 計算例（1000 USDC を kHYPE にスワップ）

```
総手数料     = 1000 × 0.30% = 3.00 USDC
LP 向け      = 3.00 × 86%   = 2.58 USDC（プール内に蓄積）
プロトコル   = 3.00 × 14%   = 0.42 USDC（FeeCollector）
```

スワップ自体の出力量計算でも 0.3% が差し引かれます（`PoolMath.getAmountOut`、fee 30 bps）。

**ガス代**: HyperEVM のネットワーク手数料が別途必要（目安はウォレット表示）。スワップ 1 回あたりの gas は `test_SwapGasUnderSmallBlock` で small block（3M gas）以内であることを確認済み。

### 2.2 クロスチェーンブリッジ / アグリゲーター（Li.FI）

| 項目 | 率 | 備考 |
|------|-----|------|
| **Project X アグリゲーター手数料** | **0%** | API 呼び出し時 `fee=0` を固定 |
| **スリッページ許容** | デフォルト **0.5%** | 設定画面で 0.1% / 0.5% / 1.0% 等に変更可（`prjx_slippage_bps`、初期 50 bps） |
| **ガス / ブリッジコスト** | ルート依存 | Li.FI 見積もりの `gasCosts` を UI に表示（USD 目安） |
| **ブリッジプロバイダー手数料** | ルート依存 | Li.FI が返す `feeCosts` に含まれる場合あり（0% アグリゲーター手数料とは別） |

UI 上の「**0% Aggregator Fees — No hidden spreads, just gas**」は、**Project X が Li.FI 経由で追加のスプレッド手数料を取らない** ことを意味します。  
Ethereum 等からのブリッジでは、送信元チェーンのガス・ブリッジルート固有のコストは別途かかります。

### 2.3 流動性（LP）

| 操作 | 手数料 |
|------|--------|
| Add / Remove Liquidity | DEX スワップ手数料は **発生しない**（mint/burn のみ） |
| LP 収益 | 上記スワップ手数料の **86%** がプールに蓄積され、LP シェア比例で分配 |

### 2.4 ポイント・紹介（金銭手数料ではない）

| 項目 | 内容 |
|------|------|
| ポイント獲得 | スワップ手数料（`totalFee`）と **1:1** で `PointsDistributor` に記録 |
| 被紹介者ブースト | 獲得ポイント **+10%**（`REFEREE_BOOST_BPS = 1000`） |
| 紹介者ボーナス | 友達が生んだポイントの **+15%** を紹介者にも付与 |

### 2.5 Cashdrop（Merkle エアドロップ）

- 請求（claim）自体にプロトコル手数料は **なし**
- ガス代のみ（HyperEVM 上の `MerkleAirdrop.claim` トランザクション）

---

## 3. 毎日の収益（ポイント）は更新されていくか

**結論**: ウォレット接続 + コントラクトデプロイ済み環境では **オンチェーンのポイント残高とエポックカウントダウンは定期ポーリングで更新** されます。  
一方、**グラフ・ランキング・未接続時の数字の tick アニメーションは現状モック（デモ用）** です。

### 3.1 オンチェーンで「リアルタイム更新」されるもの ✅

| UI 要素 | 更新方法 | 間隔 |
|---------|---------|------|
| **保有ポイント** | `PointsDistributor.getUserPoints` | 約 **5 秒**ごと（`useOnChainPoints`） |
| **次の配布まで** | `PointsDistributor.timeUntilNextEpoch` | 約 **5 秒**ごと（`useEpochCountdown`） |
| **Claim 後の残高** | トランザクション成功後に refetch | 即時 |
| **Cashdrop 請求可能額** | MerkleAirdrop + 残高読取 | ウォレット接続時 |
| **LP / プール残高** | `getReserves`, `balanceOf` | 約 **10 秒**ごと |

#### ポイントが増えるタイミング

1. ユーザーが **スワップ** する
2. `ProjectXPair.swap` が手数料（0.3%）を計算
3. `PointsDistributor.recordFeeContribution` が呼ばれ、**手数料量と同量のポイント** が加算
4. 紹介関係がある場合は +10% / +15% ボーナスも加算
5. UI は最大 5 秒以内に新しい残高を反映

#### 「毎日」のエポック（日次リセット）

- エポック長: **24 時間**（`EPOCH_DURATION = 1 days`）
- エポック切替: 24 時間経過後、**次のスワップ手数料記録時** に自動で次エポックへ（`_maybeAdvanceEpoch`）
- 表示上の「Daily Pool: 1,000,000 PTS」はプロダクト上の **日次配布プール目標**（UI 表示）。コントラクト定数 `DAILY_POOL` として定義

#### ポイントの請求（Claim）

- `claimDailyRewards()` で **未請求ポイントを一括で請求**（残高を 0 にリセット）
- 請求は **自分のウォレットからのみ** 可能（他人のポイントは取れない — テスト済み）

### 3.2 オンチェーン連動済み（2026-06 更新） ✅

| UI 要素 | 実装 |
|---------|------|
| **7 日間グラフ** | 接続中は `getUserPoints` を localStorage に記録しリアルチャート表示 |
| **Top 5 リーダーボード** | `PointsRecorded` イベントを今エポック分集計（15秒更新） |
| **自分のランク / 倍率** | リーダーボード順位から ×3.0 / ×2.0 / ×1.5 を算出 |
| **今エポックの手数料貢献** | `epochFeeContribution` を表示 |
| **紹介ランキング** | `RefereeBound` イベントから紹介数 Top 5（30秒更新） |
| **紹介人数** | `referralCount` をオンチェーン表示 |

### 3.3 依然モック / フォールバック ⚠️

| UI 要素 | 実装 | 備考 |
|---------|------|------|
| **未接続 / 未デプロイ時のポイント tick** | `store.tsx` の `livePoints` | 2 秒ごと +0〜2 |
| **グラフ（未接続時）** | `CHART_DATA` 固定 | 接続後に切替 |
| **リーダーボード（未デプロイ）** | 空状態メッセージ | |
| **Affiliate 紹介リンク URL** | 固定 `XM79B4` | 将来: 登録コードと連動 |
| **プール APR / TVL 一覧** | `constants.ts` の `POOLS` | 表示用ダミー |

接続済み + デプロイ済みの場合、ポイント表示は **オンチェーン値が優先** され、「on-chain」ラベルが付きます（`PointsTab.tsx`）。

### 3.3 ユーザー体験のまとめ

```
[ウォレット未接続]
  → ポイント数字がゆっくり増える（デモ演出）
  → グラフ・ランキングはサンプルデータ

[接続 + デプロイ済み]
  → スワップのたびにポイントがオンチェーンで増加
  → 5 秒ごとに残高・カウントダウンが更新
  → リーダーボード・ランク・7日グラフがオンチェーン/ローカル記録で更新
  → Claim でポイントを請求可能
```

---

## 4. 関連ソースコード

| トピック | ファイル |
|---------|---------|
| スワップ手数料 0.3% / LP 86% | `contracts/src/core/ProjectXPair.sol` |
| ポイント 1:1 / 24h エポック | `contracts/src/core/PointsDistributor.sol` |
| 紹介 15% / 10% | `contracts/src/core/ReferralRegistry.sol` |
| Li.FI fee=0 | `frontend/src/app/api/lifi/quote/route.ts` |
| ポイントポーリング | `frontend/src/lib/hooks/useDeFi.ts` |
| リーダーボード / グラフ | `frontend/src/lib/hooks/usePointsAnalytics.ts` |
| イベント集計 | `frontend/src/lib/points/indexEvents.ts` |
| デモ用 tick | `frontend/src/lib/store.tsx` |
| ポイント UI | `frontend/src/components/tabs/PointsTab.tsx` |

---

## 5. FAQ

**Q. スワップで実際に引かれるのは 0.3% だけ？**  
A. DEX プール手数料は 0.3% です。ガス代は別途。Li.FI ブリッジはアグリゲーター 0% ですが、ブリッジルートのガス・外部 fee は別途かかる場合があります。

**Q. LP 収益は自動でウォレットに入る？**  
A. いいえ。手数料の 86% はプール内に蓄積され、LP トークンを burn して引き出すときに比例配分されます。

**Q. ポイントは毎日自動でウォレットに送られる？**  
A. いいえ。**Claim ボタン**（`claimDailyRewards`）で明示的に請求する必要があります。スワップ後は残高が増え、UI が定期更新します。

**Q. 本番 Mainnet でも同じ手数料？**  
A. コントラクト定数は Testnet / Mainnet 共通です。デプロイされたコントラクトアドレスは `contracts/deployments/` を参照してください。
