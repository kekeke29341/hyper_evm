# 外部 cron 基盤の検討（GitHub Actions 以外）

MacBook の crontab は **スリープ・停電・再起動** で keeper / 日次 Cashdrop が止まるため、本番公開前に外部基盤へ移行する。

本ドキュメントは **GitHub Actions を使わない** 場合の候補比較と推奨方針。実装手順は [vps-cron.md](./vps-cron.md) を参照。

---

## 現状のジョブ

| ジョブ | スケジュール | スクリプト | 実行時間目安 |
|--------|-------------|-----------|-------------|
| Keeper リバランス | 6 時間ごと | `scripts/keeper-rebalance.mjs` | 1〜3 分 |
| 日次 Cashdrop | 毎日 JST 7:00 | `scripts/daily-rewards.mjs` + deployment JSON の git push | 2〜10 分 |

### インフラ要件（Must）

| 要件 | 理由 |
|------|------|
| **Node.js 20+** + `frontend/node_modules`（viem） | 既存 `.mjs` をそのまま実行 |
| **秘密鍵**（keeper / owner ウォレット） | オンチェーン Tx 署名 |
| **HyperEVM RPC** 到達 | 998 / 999 |
| **24/7 起動** | スケジュール漏れ防止 |
| **git push**（daily のみ） | Merkle / 送金履歴 JSON → main → Vercel redeploy |
| **ログ保持** | 失敗時の Tx / distributionId 調査 |

### あるとよい（Should）

| 要件 | 理由 |
|------|------|
| 失敗通知（メール / Slack / Healthchecks） | サイレント障害防止 |
| git push 失敗時の Deploy Hook 冗長化 | UI だけ古い JSON のままになる問題 |
| 手動実行（SSH 1 コマンド） | デバッグ・Mainnet 切替前テスト |

---

## 候補比較（GitHub 以外）

| 方式 | 月額目安 | 秘密鍵 | 長時間 Tx | git push | 運用負荷 | 総合 |
|------|---------|--------|-----------|----------|---------|------|
| **VPS（Hetzner / DO 等）** | €4〜8 | ファイル or env | ◎ | ◎（deploy key） | 中 | **◎ 推奨** |
| **Railway Cron** | $5〜20+ | Secrets | ○ | △（PAT 要） | 低〜中 | ○ |
| **Render Cron Job** | $7+ | Env | ○ | △ | 低〜中 | ○ |
| **Fly.io + cron** | $5〜 | Secrets | ○ | △ | 中 | ○ |
| **AWS Lambda + EventBridge** | 従量 | Secrets Manager | △（15 分上限） | △ | 高 | △ |
| **Vercel Cron** | 既存プラン | Serverless env | ×（短タイムアウト） | × | 低 | × |
| **cron-job.org 等 HTTP ping** | 無料〜 | Webhook 側に鍵 | ×（別サーバ要） | × | — | × |

### 推奨: 小規模 VPS（第一候補）

**理由:** 既存の Mac cron スクリプトを **ほぼそのまま** 使える。Blockchain Tx は数分かかる・秘密鍵を長時間メモリに載せる・git push が必要、という workload に VPS が最も素直に合う。

| 項目 | 内容 |
|------|------|
| プロバイダ例 | [Hetzner Cloud](https://www.hetzner.cloud) **CX23**（約 €4/月 EU）、DigitalOcean Basic |
| CLI | **`hcloud`** — サーバ作成〜SSH まで全部 CLI（`provision-hetzner.sh` 参照） |
| OS | Ubuntu 24.04 LTS |
| スケジューラ | `cron` または `systemd timer`（後者は journal ログが見やすい） |
| 秘密情報 | `/etc/hyperpool/env`（リポジトリ外・パーミッション 600） |
| git | read/write **Deploy key**（daily-rewards 用、`gh` CLI で自動登録可） |

→ 手順: [vps-cron.md](./vps-cron.md) · 一発: `./scripts/cron/provision-hetzner.sh`

### 次点: PaaS の Cron（Railway / Render）

リポジトリを接続し、Cron コマンドで `npm ci && node scripts/...` を定期実行する方式。

| メリット | デメリット |
|---------|-----------|
| OS パッチ・uptime をプロバイダに任せられる | ビルド時間が毎回かかる（keeper 6h ごと × npm ci は無駄） |
| Secrets UI が用意されている | git push には GitHub PAT を Secrets に置く必要 |
| | 従量課金で予測しづらい場合あり |

**向いているケース:** VPS を触りたくない・チームに Linux 運用経験がない。

**Hyperpool 向け調整案（Railway 例）:**

1. Dockerfile で `frontend` の `npm ci` をイメージに焼く（毎回 install しない）
2. Cron: `node scripts/keeper-rebalance.mjs` / `bash scripts/cron/run-daily-rewards-vps.sh`
3. Secrets: `PRIVATE_KEY`, `RPC_URL`, `DEPLOYMENT_CHAIN`, `GIT_TOKEN`（push 用）

Render / Fly も同様。詳細はプロバイダ選定後に別途 `docs/本番運用/paas-cron.md` を追加可能。

### 不向きな方式

| 方式 | 理由 |
|------|------|
| **Vercel Cron** | Hobby/Pro の実行時間上限が短く、複数 Tx + Merkle 構築に不向き。秘密鍵を Serverless に載せる設計も避けたい |
| **HTTP だけの cron サービス** | 結局 Webhook を受ける常時起動サーバが必要 → VPS と同じ |
| **Lambda のみ** | viem + 複数 Tx + git 操作のパッケージングが重い。15 分ギリギリの日もある |

---

## git push の冗長化（P2）

daily-rewards 成功後、**オンチェーン送金は完了しているが UI JSON だけ古い** 状態を防ぐ。

| 手段 | 内容 |
|------|------|
| A. Deploy key + push（現行） | `998.json` / `999.json` を main に push → Vercel 自動 redeploy |
| B. Vercel Deploy Hook | push 失敗時に `VERCEL_DEPLOY_HOOK` へ POST（`run-daily-rewards-*-vps.sh` / local 対応済み。JSON は手動 push まで stale の可能性あり） |
| C. JSON を S3 / R2 に置きフロントが fetch | 設計変更大。将来検討 |

当面は **A + Healthchecks 失敗通知** で十分。push 失敗を検知したら手動 push または Hook。

---

## 移行ロードマップ

### Phase 1 — Testnet (998) on VPS

- [ ] VPS 作成（Ubuntu 24.04）
- [ ] `./scripts/cron/provision-hetzner.sh` または `provision-vps-ssh.sh`、または [vps-cron.md](./vps-cron.md) 手動手順
- [ ] `/etc/hyperpool/env` に testnet 鍵・RPC
- [ ] Deploy key 設定 → `run-daily-rewards-vps.sh` で push テスト
- [ ] keeper / daily を手動実行 → ログ確認
- [ ] crontab または systemd timer 有効化
- [ ] Healthchecks.io 等で失敗通知
- [ ] **Mac crontab を解除**（二重実行防止）

### Phase 2 — 安定運用

- [ ] 1 週間ログ監視（keeper 4 回/日 + daily 1 回/日）
- [ ] push 失敗時の Runbook を [検証手順.md](./検証手順.md) に追記

### Phase 3 — Mainnet (999)

- [ ] `/etc/hyperpool/env` を mainnet 用に切替（`DEPLOYMENT_CHAIN=999`, `SKIP_ORACLE` なし）
- [ ] `999.json` が `deployed: true` であることを確認
- [ ] workflow 相当の手動 dry-run → 本番 cron 有効化

---

## Mac / GitHub / VPS の関係

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Mac crontab    │     │ GitHub Actions   │     │  VPS cron       │
│  (暫定・開発)   │     │ (repo 内 WF)     │     │ (本番推奨)      │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                         │
         └───────────────────────┴─────────────────────────┘
                                 │
                    keeper-rebalance.mjs
                    daily-rewards.mjs
                    （ロジックは 1 本化・二重実装禁止）
```

- **今:** Mac cron（GitHub 課金不可時）
- **本番推奨:** VPS（本ドキュメント）
- **将来:** GitHub 課金解消後は Actions も選択肢（[github-actions-cron.md](./github-actions-cron.md)）

---

## 関連

- [vps-cron.md](./vps-cron.md) — VPS セットアップ手順
- [local-mac-cron.md](./local-mac-cron.md) — 暫定 Mac 運用
- [github-actions-cron.md](./github-actions-cron.md) — GitHub 版（参考）
- [チェックリスト.md](./チェックリスト.md)
