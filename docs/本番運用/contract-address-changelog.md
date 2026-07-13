# コントラクトアドレス変更履歴（Mainnet 999）

**本番アプリが参照するアドレスを変えたとき**は、必ずこのファイルに **日時・理由・新旧アドレス・アプリ反映状況** を追記する。

| 項目 | 正本（ソース・オブ・トゥルース） |
|------|----------------------------------|
| アプリ / cron が使うアドレス | `frontend/src/lib/contracts/deployments/999.json` |
| オンチェーン運用・スクリプト | `contracts/deployments/999.json`（通常はフロントと同期） |
| 変更の説明・経緯 | **このファイル** |

---

## 現在アクティブ（アプリ本番）

**最終更新: 2026-07-13** — 第8世代 Vault。deployIdle ダストrevert修正（配当縮小の原因）。

| 役割 | アドレス | 備考 |
|------|----------|------|
| **HyperpoolVault**（アプリ） | `0xce903d884981A1D78fE12c491a2b590240FE30Bf` | 第8世代 — deployIdle ダストrevert修正（`_dropDustSide` + リトライ best-effort 化） |
| **ProjectXAdapter**（アプリ） | `0x26905DF80cDd8E255Ee322eeADe60a69b8B9dBdF` | 同上 |
| **Project X pool**（アプリ） | `0x422e586C906eb241f784B4F5a633c2C7e59A2F54` | 0.3% |
| MerkleAirdrop | `0x67d45f8535ec3f268f1acb0fe69ec87ad7aa7431` | `vaultShareToken` → `0xce90…30Bf` |
| **ReferralRegistry**（アプリ） | `0x3934Abcb5824326B59deBDb7c3410A7648b09CD2` | **アドレス方式**（`registerReferrer` / `bindReferrer`） |
| HyperCoreOracle | `0xad6b05b0b4c79264c32136842945f321f58ef94c` | 継続利用 |
| **旧 HyperpoolVault**（第7世代・retire 予定） | `0x2Efa225A0753010BD63A5c8Ee546E2958e7b7C10` | deployIdle が毎日 revert（idle 滞留）。**ホルダー `0xf352…b55`（~66.7 USDC）が引出し・再入金するまで要対応** |
| **旧 ProjectXAdapter**（第7世代） | `0xbb047b03f9c6889108ffB77f303a30Fe74A76f70` | 非参照 |
| **旧 HyperpoolVault**（retire） | `0x95dd6fA9f0403823857ba3B8d7ac6B694531f5e5` | **paused** — 入金時 idle 再投入で revert |
| **旧 ProjectXAdapter**（retire） | `0xFc938575CB2d022cB1a64C1CF102d1768C271229` | 非参照 |
| **旧 HyperpoolVault**（retire） | `0xA3f52f8288ae7caDF1C794D03e8245B4BF5499a8` | **paused** — レンジ比率バグで USDC 入金 revert |
| **旧 ProjectXAdapter**（retire） | `0xb62965C1A4dC5F2386FBC0E5719D41AB85DaaA87` | 非参照 |

本番 UI: https://hyper-evm-ten.vercel.app

---

## オンチェーンのみ存在（アプリ未切替）

（該当なし — 2026-07-08 に第6世代へ切替）

---

## 変更履歴

### 2026-07-13 — deployIdle ダストrevert修正で Vault/Adapter 再デプロイ（第8世代）

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-07-13 |
| **理由** | 第7世代の `deployIdle()` が毎日 revert。1回目のLP投入成功後、`_redeployVaultIdleOnce()` が leftover（KHYPE 3053 wei のダスト）を再mintし liquidity=0 で pool.mint が revert → 全体ロールバック。idle が $1.3→$20.8（TVLの31%）まで累積しLP外で無収益となり、日次 Cashdrop が縮小（7/11 1639 → 7/13 702 micro-USDC）。顧客クレームの一因。 |
| **修正** | `_dropDustSide()` 追加（0.01 USDC 未満の側をゼロ化し単一サイドスワップ経路へ）。リトライの `adapter.deposit` を try/catch ベストエフォート化（失敗分は `forwardIdleToVault` で回収し idle 保持）。回帰テスト2件 + メインネットフォーク検証（`DeployIdleDustFork.t.sol` — 実障害状態に修正版バイトコードを etch し deployIdle 成功、滞留 idle の9割超をLP投入）。 |
| **検証** | forge 全テストパス。オンチェーンで adapter.vault / pool / fee=3000 / 7/60/33 split / keeper / airdrop.vaultShareToken を確認済み。 |
| **アプリ反映** | `contracts/deployments/999.json` / `frontend/src/lib/contracts/deployments/999.json` 更新（`vaultDeployBlock=40331302`、checkpoint 類リセット） |
| **資金移行** | 第7世代ホルダー `0xf352…b55`（~66.7 USDC、うち ~$20.8 は idle）は**運営管理外ウォレット** — 本人による引出し→gen8 再入金が必要。引出し時に第7世代が paused の場合は一時 `unpause()` で対応。 |

| 役割 | 旧 | 新 |
|------|----|----|
| HyperpoolVault | `0x2Efa225A0753010BD63A5c8Ee546E2958e7b7C10` | `0xce903d884981A1D78fE12c491a2b590240FE30Bf` |
| ProjectXAdapter | `0xbb047b03f9c6889108ffB77f303a30Fe74A76f70` | `0x26905DF80cDd8E255Ee322eeADe60a69b8B9dBdF` |

---

### 2026-07-10 — 本日 Cashdrop 手動送付 + cron 高速化

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-07-10 |
| **Cashdrop** | 07-10 harvest 後 distribute が cron タイミング競合で未実行のため手動送付。[0xdd89d327…](https://hyperevmscan.io/tx/0xdd89d327354207a9b72eb870ca3b6d0d80df62e118e77a0ce531cf38dc95e5a7)（608 micro-USDC） |
| **修正** | `SKIP_LOG_SCAN` を cron から Node へ export、初回 checkpoint なし時はスナップショット配布、distribute を JST 09:00/09:30 に変更、`vaultDeployBlock` 追加 |
| **Vercel 本番** | デプロイ済み（2026-07-10 — https://hyper-evm-ten.vercel.app / `dpl_1A7HYrqBnXiYhPDto7DhsfkpnK1Q`） |

### 2026-07-09 — 入金 revert 修正（第7世代）

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-07-09 |
| **理由** | 第6世代で USDC 入金が 100% revert。① `rangeDepositRatioBps` が constructor 既定 refPrice ($42) のレンジで比率計算し、実際の mint（spot ~$67）と不一致 → USDC-only で NPM mint 失敗。② 入金直後の `_redeployVaultIdleOnce` が dust 再投入で 2 回目 mint を revert させ全体失敗。 |
| **修正** | `_depositTickRange()` を live pool price 優先に。入金 path から `_redeployVaultIdleOnce` を除去（keeper `deployIdle` のみ）。 |
| **検証** | Mainnet fork で `depositUSDC(66.666666 USDC)` 成功確認。 |
| **アプリ反映** | `999.json` 更新 |
| **Vercel 本番** | デプロイ済み（2026-07-09 — https://hyper-evm-ten.vercel.app / `dpl_9gcAq9QdgrgkszXJXLkQQ3CVYi7H`） |

| 役割 | 旧 | 新 |
|------|----|----|
| HyperpoolVault | `0x95dd6fA9f0403823857ba3B8d7ac6B694531f5e5` | `0x2Efa225A0753010BD63A5c8Ee546E2958e7b7C10` |
| ProjectXAdapter | `0xFc938575CB2d022cB1a64C1CF102d1768C271229` | `0xbb047b03f9c6889108ffB77f303a30Fe74A76f70` |

---

### 2026-07-08 — レンジ比率入金 + 実資産比率で Vault/Adapter 再デプロイ（第6世代）

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-07-08 |
| **理由** | 単一側面入金が 50/50 スワップ固定で CL レンジ比率とズレ、idle HYPE が LP 外に滞留。加えて UI が TVL の 50/50 をハードコード表示していた。`rangeDepositRatioBps` / `positionTokenAmounts` / `_redeployVaultIdleOnce` を含む新スタックへ移行。 |
| **事前確認** | 全シェアホルダー残高 0。Vault `totalAssetsUsdc` ≈ $0.000985（dead 最低シェア分のダストのみ）。ユーザー資金は全額引出済み。 |
| **アプリ反映** | `contracts/deployments/999.json` / `frontend/src/lib/contracts/deployments/999.json` 更新 |
| **Vercel 本番** | デプロイ済み（2026-07-08 — https://hyper-evm-ten.vercel.app / `dpl_2S3oyJsrp3EJQuGhNNDmch3YFgSC`） |
| **オンチェーン** | 新 Vault `0xA3f5…99a8` / 新 Adapter `0xb629…aA87`。MerkleAirdrop `vaultShareToken` 更新、旧 Vault `0x5D6e…874e` pause [0x2b7d7f…](https://hyperevmscan.io/tx/0x2b7d7f3d59022558297468be5c13ee860c9bae067dbd7e6ec3d2abe6dee46ce2) |

| 役割 | 旧 | 新 |
|------|----|----|
| HyperpoolVault | `0x5D6ee5B7DCCC30c227B4375c77f31fa12aD5874e` | `0xA3f52f8288ae7caDF1C794D03e8245B4BF5499a8` |
| ProjectXAdapter | `0x432A72d0894C1B6d967A90abdBef19e9E326e41e` | `0xb62965C1A4dC5F2386FBC0E5719D41AB85DaaA87` |

主要デプロイ tx:

| 内容 | Tx |
|------|-----|
| Adapter CREATE | [0x34334b…](https://hyperevmscan.io/tx/0x34334b8158fdbcb7e4ced653969f0aa564c98b1cd352a980571cbd88d74e05b4) |
| Vault CREATE | [0x5ebf25…](https://hyperevmscan.io/tx/0x5ebf25c09b8efa61df2fed8c41d1df22c0f600a36fce933d555fe810a8b33301) |
| setFeeSwapSlippageBps | [0x4d9507…](https://hyperevmscan.io/tx/0x4d9507f2735472429b83f8760993d1d016530de8203bbc0e5cc36869e0d75364) |
| airdrop.setVaultShareToken | [0x3d23ab…](https://hyperevmscan.io/tx/0x3d23abe7043297a26703472d47ec8edb0af3c3729b68d23ecb076bf9c25100fa) |
| oldVault.pause | [0x2b7d7f…](https://hyperevmscan.io/tx/0x2b7d7f3d59022558297468be5c13ee860c9bae067dbd7e6ec3d2abe6dee46ce2) |

---

### 2026-07-06 — セキュリティ修正 + idle 対策で Vault/Adapter 再デプロイ（第5世代）

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-07-06 |
| **理由** | 2026-07-05 idle KHYPE インシデント後、全ユーザー出金完了。セキュリティ修正（NAV スポット統一・入金ガード・$42 フォールバック除去等）と `deployIdle()` を含む新スタックへ移行。 |
| **アプリ反映** | `contracts/deployments/999.json` / `frontend/src/lib/contracts/deployments/999.json` 更新済み |
| **Vercel 本番** | デプロイ済み（2026-07-06 — https://hyper-evm-ten.vercel.app / `dpl_5eAAmYo5GzHibWLm5G5Cx9t25XLV`） |
| **オンチェーン** | 新 Vault `0x5D6e…874e` / 新 Adapter `0x432A…41e` デプロイ。MerkleAirdrop `vaultShareToken` 更新、旧 Vault `0x03cF…aD99` pause [0xc0444b…](https://hyperevmscan.io/tx/0xc0444bf2c99955bd93fcdcc99cfd8bc3e647221b14c48dc71fde339328978234) |

| 役割 | 旧 | 新 |
|------|----|----|
| HyperpoolVault | `0x03cF822d0192D687cBDc2fAe6B8492a27634aD99` | `0x5D6ee5B7DCCC30c227B4375c77f31fa12aD5874e` |
| ProjectXAdapter | `0x1A347c716721548C298B426aD90dfbb8B5BF328d` | `0x432A72d0894C1B6d967A90abdBef19e9E326e41e` |

---

### 2026-07-04 — 0.3% Vault tick spacing 修正で再デプロイ

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-07-04 |
| **理由** | 0.3% Project X pool の `tickSpacing` は 60 だが、`ProjectXPrice` が旧 0.05% pool 用の 10 で tick を丸めていたため、初回 `depositUSDC` / `depositHYPE` が Project X `mint` で revert。 |
| **アプリ反映** | `contracts/deployments/999.json` / `frontend/src/lib/contracts/deployments/999.json` 更新済み |
| **Vercel 本番** | デプロイ済み（2026-07-04 — https://hyper-evm-ten.vercel.app / `dpl_2gGfmC3jQcY6z4NAQYG6iehXYgoK`） |
| **オンチェーン** | 新 Vault / Adapter デプロイ済み。MerkleAirdrop `vaultShareToken` 更新 [0x3809f8…](https://hyperevmscan.io/tx/0x3809f879b65f3bc1c911cdad8b78e4d1b37c3b19e3850e7a3085a207d4900bac)、不具合版 Vault pause [0x9ac0d8…](https://hyperevmscan.io/tx/0x9ac0d83e2d32f7a8a9e30c1a7128e4a407e39afd2ec6ab8589a253ec0575cca2) |

| 役割 | 旧（不具合版） | 新（修正版） |
|------|----------------|--------------|
| HyperpoolVault | `0xF749790D37cc125B6F5d2BC5a64B56577a26d394` | `0x03cF822d0192D687cBDc2fAe6B8492a27634aD99` |
| ProjectXAdapter | `0xa6CCDC039e09889ed6E7ee8377e384F0772b706a` | `0x1A347c716721548C298B426aD90dfbb8B5BF328d` |
| Project X pool | `0x422e586C906eb241f784B4F5a633c2C7e59A2F54` (0.3%) | `0x422e586C906eb241f784B4F5a633c2C7e59A2F54` (0.3%) |

---

### 2026-07-02 — ReferralRegistry をアドレス方式へ再デプロイ

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-07-02 |
| **理由** | 紹介を MYCODE+localStorage ハイブリッドからウォレットアドレス一本化へ。バグ削減・運用簡素化。ユーザー未登録のため旧レジストリは retire。 |
| **アプリ反映** | `999.json` 更新 + フロント簡略化 |
| **Vercel 本番** | デプロイ済み（2026-07-02 — https://hyper-evm-ten.vercel.app ） |
| **オンチェーン** | `DeployReferral.s.sol` — [0x3934Abcb…](https://hyperevmscan.io/address/0x3934Abcb5824326B59deBDb7c3410A7648b09CD2) |

| 役割 | 旧 | 新 |
|------|----|----|
| ReferralRegistry | `0xd3439a2b33b48f7ddaa45cd2f0f89de12e36c806` | `0x3934Abcb5824326B59deBDb7c3410A7648b09CD2` |

---

### 2026-07-02 — アプリを 0.3% 新 Vault へ切替（旧 Vault pause）

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-07-02 |
| **理由** | 大口ホルダー旧 Vault 引出し完了後、7/60/33 + 0.3% プールへ本番切替 |
| **アプリ反映** | `999.json` 更新（`complete-pool-3000-migration.mjs`） |
| **Vercel 本番** | デプロイ済み（2026-07-02 — https://hyper-evm-ten.vercel.app ） |
| **オンチェーン** | 旧 Vault `pause()` — [0xbea016…](https://hyperevmscan.io/tx/0xbea01607fdb6793c4bc2969fad865863dff0a5cc69958cf6b5715a7a215bad20) |
| **初回 LP** | 未実施（運営ウォレット USDC 不足。初回 deposit はユーザーまたは運営が ≥0.07 USDC で実行） |

| 役割 | 旧 | 新 |
|------|----|----|
| HyperpoolVault | `0xe5f4d055c5e2d29f26862a543377c2525a41dde8` | `0xF749790D37cc125B6F5d2BC5a64B56577a26d394` |
| ProjectXAdapter | `0x462e71b9e66414a2108d35ba6790428a8a046ca4` | `0xa6CCDC039e09889ed6E7ee8377e384F0772b706a` |
| Project X pool | `0x6c9A33E3b592C0d65B3Ba59355d5Be0d38259285` (0.05%) | `0x422e586C906eb241f784B4F5a633c2C7e59A2F54` (0.3%) |

---

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

| 役割 | 旧（第1世代・withdraw 済み） | 新（第2世代・**現アプリ**） |
|------|------------------------------|------------------------------|
| HyperpoolVault | `0x2db5fcfc0c9eed612a544b99c9097fbbc0cf502d` | `0xe5f4d055c5e2d29f26862a543377c2525a41dde8` |
| ProjectXAdapter | （第1世代 adapter） | `0x462e71b9e66414a2108d35ba6790428a8a046ca4` |

---

## Vault 世代整理（Mainnet 999）

Mainnet には **複数世代** の HyperpoolVault が存在し得る。ユーザー・運営が「どのアドレスを見ているか」で残高・withdraw 可否が変わる。

| 世代 | HyperpoolVault | アプリ本番 | 状態 |
|------|----------------|--------------------------|------|
| **第1世代** | `0x2db5fcfc0c9eed612a544b99c9097fbbc0cf502d` | **参照しない** | 運用上 retire。一部ユーザーはここから withdraw 済み |
| **第2世代** | `0xe5f4d055c5e2d29f26862a543377c2525a41dde8` | **参照しない**（paused） | 大口ホルダー withdraw 済み |
| **第3世代**（0.3% / 不具合版） | `0xF749790D37cc125B6F5d2BC5a64B56577a26d394` | **参照しない**（paused） | `tickSpacing=10` のまま 0.3% pool を mint しようとして deposit が revert |
| **第4世代**（0.3% / 修正版） | `0x03cF822d0192D687cBDc2fAe6B8492a27634aD99` | **参照する**（`999.json`） | `tickSpacing=60` 修正版。初回 deposit 待ち |

HyperEVMScan（第2世代・現アプリ）: https://hyperevmscan.io/address/0xe5f4d055c5e2d29f26862a543377c2525a41dde8#readContract

---

## お客様向け UI — Testnet/Mainnet 混同（2026-06-30 修正）

本番 Vercel が `NEXT_PUBLIC_DEFAULT_CHAIN_ID=998` のままだったため、Mainnet (999) に資金があるユーザーが Testnet に誘導され **ポジション 0 表示** になる不具合があった。

- 修正: デフォルト chain 999、998/999 両方を正しいネットワークとして扱う、Mainnet 残高検出バナー
- Vercel 本番 env: `NEXT_PUBLIC_DEFAULT_CHAIN_ID=999` を設定して redeploy すること

---

**対象ウォレット:** `0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55`  
**HyperEVMScan:** https://hyperevmscan.io/address/0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55

### 結論

- **バグではない。** 第1世代 Vault からは **正常に全額 withdraw 済み**。
- その **約2.5時間後** に **第2世代 Vault（現アプリ）へ再 deposit** している。
- **第2世代からの withdraw は未実行。** 約 **$66** が第2世代 Vault + LP 内に残存。

### タイムライン（オンチェーン）

| 順 | ブロック（目安） | 操作 | Vault | tx |
|----|-----------------|------|-------|-----|
| 1 | 39095949 | **Deposit $100 USDC** | 第1世代 `0x2db5…` | [0x288afa…](https://hyperevmscan.io/tx/0x288afa50427e7cca7fcdcba38ac0f6f403ae1d265c24fbaaeb2e1bff8ec7d446) |
| 2 | 39098733 | **Withdraw 全シェア** | 第1世代 `0x2db5…` | [0xe58da0…](https://hyperevmscan.io/tx/0xe58da0badc300468cd0eb96344d708e51974b2906cc9118ea5f7cd412c6861d5) |
| | | 受取: 約 **$52.33 USDC + 0.20 WHYPE** | | （$100 投入に対する LP 評価額） |
| 3 | 39108114 | **Deposit 約 $64.87 USDC** | 第2世代 `0xe5f4…`（**現アプリ**） | [0xdb9fd9…](https://hyperevmscan.io/tx/0xdb9fd9d00b261f4ec3a44b837dd54b090d812ffcea46799d68fabf92c50df0fb) |
| 4 | — | **Withdraw なし** | 第2世代 `0xe5f4…` | — |

### お客様の認識と実態のズレ

| お客様の認識（想定） | チェーン上の事実 |
|---------------------|-----------------|
| 「Hyperpool から withdraw した」 | **第1世代** `0x2db5…` からは **withdraw 成功** |
| 「もう資金はないはず」 | **第2世代** `0xe5f4…` に **再 deposit 済み** |
| HyperEVMScan の Token Holdings が少ない | Vault ページは **idle 分のみ** 表示。総額は `totalAssetsUsdc()` ≒ **$66** |

### お客様への withdraw 案内

**はい — 現アプリが参照する第2世代 Vault から withdraw してもらえばよい。**

| 項目 | 値 |
|------|-----|
| Vault（アプリ `999.json`） | `0xe5f4d055c5e2d29f26862a543377c2525a41dde8` |
| 操作 | https://hyper-evm-ten.vercel.app を **ウォレット `0xf35208bf…` で接続** → Withdraw |
| 返却見込み | 約 **$66**（USDC + WHYPE、LP 解消込み） |
| 第1世代 `0x2db5…` | **もう withdraw 済み** — ここから追加引出し不要 |
| 第3世代 `0xF749…`（0.3%） | **deposit なし** — 関係なし |

**前提:** 第2世代 Vault が `paused: false` であること（withdraw 不可のときは運営が `unpause()`）。

### 再発防止（Vault redeploy 時）

1. **Vault アドレス変更は必ずこのファイルに追記**（日時・旧→新・HyperEVMScan リンク）
2. **既存 deposit 者へ「旧 Vault withdraw → 新 Vault deposit」の2段階が必要**と明示
3. 「withdraw した」報告は **tx hash と Vault アドレス** で第何世代か確認する
4. サポート用に `balanceOf(ユーザー)` を **現行 `999.json` の Vault** で確認する

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
