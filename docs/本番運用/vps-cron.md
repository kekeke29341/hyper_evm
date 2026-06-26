# VPS で keeper / 日次 Cashdrop を回す

Mac crontab の代替として、**常時起動の Linux VPS** で `keeper-rebalance.mjs` と `daily-rewards.mjs` を定期実行する手順。

候補比較: [external-cron.md](./external-cron.md)

---

## 前提

| 項目 | 内容 |
|------|------|
| VPS | Hetzner **CX23** 相当（2 vCPU / 4GB、約 €4/月 EU） |
| OS | Ubuntu 24.04 LTS |
| リポジトリ | `/opt/hyperpool/hyper_evm`（例） |
| 秘密情報 | `/etc/hyperpool/env`（**git に含めない**） |
| Node | 20 LTS |
| Chain | まず Testnet `998`、Mainnet 公開時に `999` |

---

## 0. CLI 一発セットアップ（推奨）

Hetzner アカウント作成と API トークン取得だけブラウザで行い、あとは Mac から全部 CLI:

```bash
# 1. https://console.hetzner.cloud → Project → Security → API tokens (Read & Write)
export HCLOUD_TOKEN='your-token'

# 2. リポジトリ root から（.env.testnet を VPS にコピー）
./scripts/cron/provision-hetzner.sh
```

`gh` CLI がログイン済みなら GitHub Deploy key も自動登録。完了後 **Mac crontab を解除**（二重実行防止）。

**Hetzner のデビットカードが使えない場合:** 国内 VPS（ConoHa 等）を契約し、IP を渡して `./scripts/cron/provision-vps-ssh.sh` を使う（下記「支払いで Hetzner が使えない場合」）。

---

## 支払いで Hetzner が使えない場合（日本でよくある）

Hetzner は **EUR の海外課金** のため、日本のデビット（特に国際決済未対応）が弾かれることが多い。

| 選択肢 | 月額 | 支払い | こちらが設定 |
|--------|------|--------|-------------|
| **ConoHa VPS 2GB** | 約 2,000 円 | JCB/コンビニ/銀行振込/PayPal（チャージ） | ◎ SSH 後 `provision-vps-ssh.sh` |
| **Oracle Cloud Free** | **0 円** | クレジット/デビット（本人確認のみ・課金なし） | △ 登録が難しい・ARM 在庫不足あり |
| **Mac cron 継続** | 0 円 | — | 済（スリープ注意） |
| Hetzner + クレジット | 約 €4 | 国際対応クレジット / PayPal（アカウント次第） | `provision-hetzner.sh` |

**ConoHa 手順（最短）:**

1. [ConoHa VPS](https://vps.conoha.jp/) → Ubuntu 24.04・2GB プラン・東京
2. 支払い: **ConoHaチャージ**（コンビニ 1,000 円〜）または JCB クレジット
3. コントロールパネルで root SSH 鍵を登録、VPS の IP を控える
4. Mac から:

```bash
export VPS_IP='（ConoHa の IP）'
export VPS_SSH_KEY=~/.ssh/（登録した鍵）
./scripts/cron/provision-vps-ssh.sh
```

---

## 1. VPS 初期セットアップ（手動）

```bash
# ローカルから SSH（IP は Hetzner 等のダッシュボード）
ssh root@YOUR_VPS_IP

apt update && apt upgrade -y
apt install -y git curl build-essential

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 専用ユーザー（root で cron を回さない）
useradd -m -s /bin/bash hyperpool
mkdir -p /opt/hyperpool
chown hyperpool:hyperpool /opt/hyperpool
```

---

## 2. リポジトリ clone

```bash
sudo -u hyperpool bash -lc '
  cd /opt/hyperpool
  git clone git@github.com:YOUR_ORG/hyper_evm.git
  cd hyper_evm/frontend && npm ci
'
```

### Deploy key（daily-rewards の git push 用）

1. VPS 上で `sudo -u hyperpool ssh-keygen -t ed25519 -f /opt/hyperpool/.ssh/deploy_key -N ""`
2. 公開鍵を GitHub → **Settings → Deploy keys → Add**（**Allow write access** にチェック）
3. `sudo -u hyperpool bash -lc 'cat >> /opt/hyperpool/.ssh/config <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile /opt/hyperpool/.ssh/deploy_key
  IdentitiesOnly yes
EOF
chmod 600 /opt/hyperpool/.ssh/config'
4. remote が HTTPS なら SSH に変更:

```bash
sudo -u hyperpool bash -lc 'cd /opt/hyperpool/hyper_evm && git remote set-url origin git@github.com:YOUR_ORG/hyper_evm.git'
```

`git push` テスト:

```bash
sudo -u hyperpool bash -lc 'cd /opt/hyperpool/hyper_evm && git push origin HEAD'
```

Branch protection がある場合は、deploy key または bot 用 bypass を設定（[github-actions-cron.md](./github-actions-cron.md) §4 と同趣旨）。

---

## 3. 環境変数ファイル

```bash
install -d -m 750 -o root -g hyperpool /etc/hyperpool
install -m 640 -o root -g hyperpool /dev/stdin /etc/hyperpool/env <<'EOF'
# Testnet (998) — 本番 999 切替時は DEPLOYMENT_CHAIN と RPC を変更
DEPLOYMENT_CHAIN=998
RPC_URL=https://rpcs.chain.link/hyperevm/testnet
SKIP_ORACLE=1
REF_PRICE_USDC6=25

# keeper / owner ウォレット（0x 付きでも可）
MAIN_PRIVATE_KEY=0xYOUR_KEY_HERE

# daily-rewards（必要に応じて）
# OPERATOR_WALLET=0x...
EOF
chmod 640 /etc/hyperpool/env
```

ガス用 HYPE が入った keeper 権限ウォレットであることを確認。

---

## 4. 手動テスト

```bash
export HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm
export HYPERPOOL_ENV_FILE=/etc/hyperpool/env

sudo -u hyperpool bash -lc "
  export HYPERPOOL_ROOT=$HYPERPOOL_ROOT
  export HYPERPOOL_ENV_FILE=$HYPERPOOL_ENV_FILE
  $HYPERPOOL_ROOT/scripts/cron/run-keeper-vps.sh
"

sudo -u hyperpool bash -lc "
  export HYPERPOOL_ROOT=$HYPERPOOL_ROOT
  export HYPERPOOL_ENV_FILE=$HYPERPOOL_ENV_FILE
  $HYPERPOOL_ROOT/scripts/cron/run-daily-rewards-vps.sh
"
```

ログ: `/var/log/hyperpool/keeper.log` , `/var/log/hyperpool/daily.log`

---

## 5. cron インストール

```bash
export HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm
export HYPERPOOL_ENV_FILE=/etc/hyperpool/env

sudo -u hyperpool env \
  HYPERPOOL_ROOT="$HYPERPOOL_ROOT" \
  HYPERPOOL_ENV_FILE="$HYPERPOOL_ENV_FILE" \
  "$HYPERPOOL_ROOT/scripts/cron/install-vps-crontab.sh"
```

スケジュール:

| 時刻 | 処理 |
|------|------|
| 毎日 JST 7:00 | daily-rewards + JSON push |
| 6 時間ごと | keeper rebalance |

---

## 6. コード更新（pull）

VPS 上で main を追従:

```bash
sudo -u hyperpool bash -lc '
  cd /opt/hyperpool/hyper_evm
  git pull origin main
  cd frontend && npm ci
'
```

デプロイ後の初回のみ。以降は contract / script 変更時のみ pull。

---

## 7. 監視（推奨）

[Healthchecks.io](https://healthchecks.io/) 等で **daily ジョブの成功 ping** を受ける。

`/etc/hyperpool/env` に追加:

```bash
HEALTHCHECK_DAILY_URL=https://hc-ping.com/your-uuid
HEALTHCHECK_KEEPER_URL=https://hc-ping.com/your-uuid-keeper
```

スクリプトはジョブ成功時に ping、**失敗時は `{URL}/fail`** を送る（未設定ならスキップ）。`_vps-common.sh` の `run_with_healthcheck` が ERR トラップで処理する。

---

## 8. Mainnet (999) 切替

1. `/etc/hyperpool/env` を更新:
   - `DEPLOYMENT_CHAIN=999`
   - `RPC_URL=https://rpc.hyperliquid.xyz/evm`
   - `SKIP_ORACLE` 行を削除
2. `999.json` がデプロイ済みであること
3. 手動で keeper / daily を 1 回ずつ実行
4. cron はそのまま（env 参照のため）

---

## 9. Mac cron からの移行

1. VPS で 24h 安定稼働を確認
2. **Mac の crontab を先に解除**（二重 keeper / 二重送金リスク）

```bash
# Mac 上
crontab -l | awk '
  />>> hyperpool cron begin >>>/ { skip=1; next }
  /<<< hyperpool cron end <<</ { skip=0; next }
  skip { next }
  { print }
' | crontab -
```

3. [チェックリスト.md](./チェックリスト.md) の cron 項目を更新

---

## トラブルシュート

| 症状 | 確認 |
|------|------|
| `Set PRIVATE_KEY` | `/etc/hyperpool/env` の権限・`MAIN_PRIVATE_KEY` |
| `node: not found` | cron の PATH。`install-vps-crontab.sh` は `/usr/bin` を含む |
| git push failed | Deploy key の write 権限、branch protection |
| keeper が動かない | `SKIP_ORACLE=1`（998）、ガス、Vault アドレス |
| 二重実行 | Mac cron が残っていないか |

---

## 関連

- [external-cron.md](./external-cron.md)
- [local-mac-cron.md](./local-mac-cron.md)
- [github-actions-cron.md](./github-actions-cron.md)
