# Windows Server + WSL2 で keeper / 日次 Cashdrop を回す

`hyperpool-windows-bundle.zip` を使い、**Windows Server の WSL2 (Ubuntu)** で cron ジョブを動かす手順。  
Cursor (AI エディタ) をターミナルとして使いながらセットアップします。

対象: keeper rebalance（6 時間ごと）+ Cashdrop harvest/distribute（JST 07:00 / 09:00）

---

## 前提条件

| 項目 | 要件 |
|------|------|
| OS | Windows Server 2019 / 2022 |
| WSL2 | インストール済み、Ubuntu 22.04 または 24.04 |
| Cursor | Windows 側にインストール済み |
| 秘密鍵 | `MAIN_PRIVATE_KEY`（keeper / daily-rewards 共通） |
| ネットワーク | GitHub (SSH or HTTPS) および Hyperliquid RPC に到達できること |
| 権限 | PowerShell を管理者実行できること |

---

## 全体の流れ

```
1. WSL2 + Ubuntu をインストール（未済の場合）
2. Cursor で WSL2 に接続
3. zip を展開してセットアップスクリプトを実行
4. 秘密鍵を設定
5. GitHub push 権限を設定（deploy key or PAT）
6. 手動テストで動作確認
7. Windows Task Scheduler で起動時 cron 自動起動を登録
8. Mac cron を停止
```

---

## ステップ 1: WSL2 + Ubuntu のインストール

> **既に WSL2 Ubuntu が使える場合はスキップ。**

PowerShell を **管理者として実行** し:

```powershell
wsl --install -d Ubuntu
```

インストール後に Windows を再起動。初回起動時に Ubuntu ユーザー名とパスワードを設定する（`hyperpool` 以外でよい）。

バージョン確認:

```powershell
wsl --list --verbose
# NAME      STATE   VERSION
# Ubuntu    Running 2         ← VERSION が 2 であること
```

---

## ステップ 2: Cursor を WSL2 に接続する

1. Cursor を起動
2. 左下の `><` アイコン → **「Connect to WSL」** または **「Open Folder in WSL...」** を選択
3. Ubuntu が選択肢に出たら選択 → 接続完了
4. Cursor のターミナル（`Ctrl+\`` `` ` ``）を開くと、プロンプトが `user@hostname:~$`（Linux）になっていることを確認

> Cursor の拡張機能は WSL 側に再インストールが必要になる場合があります。プロンプトが表示されれば OK です。

---

## ステップ 3: zip を WSL2 に転送して展開

### 3-1. zip をどこに置くか

`hyperpool-windows-bundle.zip` を Windows 側の任意の場所に保存しておきます。  
例: `C:\Users\Administrator\Downloads\hyperpool-windows-bundle.zip`

### 3-2. WSL2 から展開（Cursor ターミナルで実行）

```bash
# Windows の C ドライブは /mnt/c でアクセスできる
# 例: Downloads に置いた場合
cd /tmp
cp /mnt/c/Users/Administrator/Downloads/hyperpool-windows-bundle.zip .

# unzip がなければインストール
sudo apt-get install -y unzip

# 展開
unzip hyperpool-windows-bundle.zip
ls hyperpool-windows-bundle/
```

---

## ステップ 4: セットアップスクリプトを実行

```bash
cd /tmp/hyperpool-windows-bundle
sudo bash setup.sh
```

スクリプトが行うこと:
- Node.js 20 インストール（未インストールの場合）
- `hyperpool` Linux ユーザー作成
- `/opt/hyperpool/hyper_evm/` にファイルをコピー
- `frontend/npm ci`（viem 等の依存関係をインストール）
- `/etc/hyperpool/env` が存在する場合は crontab も自動登録

実行ログの末尾に以下が出れば成功:

```
セットアップ完了
インストール先: /opt/hyperpool/hyper_evm
```

---

## ステップ 5: 秘密鍵を設定する

```bash
# envファイルをテンプレートからコピー
sudo install -d -m 750 /etc/hyperpool
sudo cp /opt/hyperpool/hyper_evm/env.example /etc/hyperpool/env

# 編集
sudo nano /etc/hyperpool/env
```

最低限設定が必要な項目:

```bash
MAIN_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE   # keeper + daily-rewards 共通
DEPLOYMENT_CHAIN=999                        # mainnet
```

> **セキュリティ**: `/etc/hyperpool/env` はパーミッション `640`（hyperpool グループのみ読める）で保護されます。git には含まれません。

`Ctrl+O` で保存、`Ctrl+X` で終了。

---

## ステップ 6: GitHub push 権限を設定する

daily-rewards は Merkle 更新後に `contracts/deployments/999.json` 等を `git push` します。  
push 権限がないと distribute は成功してもフロントに反映されません。

### 方法A: SSH Deploy key（推奨）

WSL2 の `hyperpool` ユーザーで鍵を生成し、GitHub に登録します。

```bash
# hyperpool ユーザーで実行
sudo -u hyperpool bash -c '
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N "" -C "hyperpool-windows"
  cat ~/.ssh/deploy_key.pub
'
```

出力された公開鍵（`ssh-ed25519 ...`）をコピーし:

1. GitHub → リポジトリ → **Settings → Deploy keys → Add deploy key**
2. Title: `hyperpool-windows`、Key: 公開鍵をペースト
3. **Allow write access** にチェック → **Add key**

WSL2 側で SSH 設定:

```bash
sudo -u hyperpool bash -c '
cat > ~/.ssh/config <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/deploy_key
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
'
```

接続テスト:

```bash
sudo -u hyperpool ssh -T git@github.com
# Hi kekeke29341/hyper_evm! You've successfully authenticated... と出れば OK
```

リモート URL を SSH に変更（HTTPS になっている場合）:

```bash
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm \
  remote set-url origin git@github.com:kekeke29341/hyper_evm.git
```

push テスト:

```bash
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm push origin HEAD
```

### 方法B: Personal Access Token（HTTPS）

GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**  
スコープ: `repo` にチェック → 生成 → トークンをコピー

```bash
sudo -u hyperpool git -C /opt/hyperpool/hyper_evm \
  remote set-url origin https://TOKEN@github.com/kekeke29341/hyper_evm.git
```

---

## ステップ 7: 手動テストで動作確認

### crontab が登録されているか確認

```bash
sudo -u hyperpool crontab -l
```

以下のような出力が出れば OK:

```
# >>> hyperpool vps cron begin >>>
# Daily Cashdrop harvest (JST 07:00)
0 7 * * * TZ=Asia/Tokyo /opt/hyperpool/hyper_evm/scripts/cron/run-daily-harvest-vps.sh >> ...
...
# <<< hyperpool vps cron end <<<
```

### keeper を手動テスト

```bash
sudo -u hyperpool env \
  HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm \
  HYPERPOOL_ENV_FILE=/etc/hyperpool/env \
  /opt/hyperpool/hyper_evm/scripts/cron/run-keeper-vps.sh
```

エラーなく終了すれば OK。ログ:

```bash
tail -50 /var/log/hyperpool/keeper.log
```

### daily-rewards を手動テスト（harvest のみ）

```bash
sudo -u hyperpool env \
  HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm \
  HYPERPOOL_ENV_FILE=/etc/hyperpool/env \
  DAILY_REWARDS_PHASE=harvest \
  /opt/hyperpool/hyper_evm/scripts/cron/run-daily-harvest-vps.sh
```

ログ:

```bash
tail -100 /var/log/hyperpool/daily.log
```

---

## ステップ 8: Windows 起動時に cron を自動起動する

WSL2 を再起動しても cron デーモンが自動起動するよう、**Windows Task Scheduler** にタスクを登録します。

### 8-1. PowerShell スクリプトで登録（Cursor の PowerShell ターミナルで実行）

Cursor で **新しいターミナル → PowerShell** を選択し（WSL ではなく PowerShell）:

```powershell
# 管理者権限で実行していることを確認
# 管理者でない場合: ターミナルを右クリック → 管理者として実行

# setup-windows.ps1 が C:\hyperpool\ に展開済みの場合:
cd C:\hyperpool\hyperpool-windows-bundle\
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\setup-windows.ps1
```

または手動でタスクを登録:

```powershell
$action = New-ScheduledTaskAction `
  -Execute "wsl.exe" `
  -Argument "-d Ubuntu -- bash -c 'service cron start 2>/dev/null || true'"

$trigger = New-ScheduledTaskTrigger -AtStartup

$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName "HyperpoolWSLCron" `
  -Description "WSL2 cron daemon for Hyperpool keeper/daily-rewards" `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal

# 今すぐ起動
wsl -d Ubuntu -- bash -c "service cron start"
```

### 8-2. 確認

```powershell
# タスク一覧に出るか確認
Get-ScheduledTask -TaskName "HyperpoolWSLCron"
```

```bash
# WSL2 内で cron が動いているか確認
service cron status
# または
pgrep cron && echo "running"
```

---

## ステップ 9: Mac cron を停止する

VPS / Windows での 24h 安定動作を確認したら、**Mac の crontab を解除**します（二重実行防止）。

**Mac のターミナルで:**

```bash
crontab -l | awk '
  />>> hyperpool cron begin >>>/ { skip=1; next }
  /<<< hyperpool cron end <<</ { skip=0; next }
  skip { next }
  { print }
' | crontab -

# 確認（出力が空なら OK）
crontab -l | grep hyperpool
```

---

## スケジュール確認

Windows Server 上で稼働するジョブ:

| 時刻 (JST) | スクリプト | 処理 |
|------------|-----------|------|
| 毎日 07:00 | `run-daily-harvest-vps.sh` | 株主 sync → オンチェーン harvest |
| 毎日 09:00 | `run-daily-distribute-vps.sh` | Merkle 計算 → distribute → git push |
| 毎日 09:30 | `run-daily-distribute-vps.sh` | 09:00 が harvest 未完了の場合のリトライ |
| 6 時間ごと | `run-keeper-vps.sh` | LP リバランス |

---

## ログの確認方法（Cursor ターミナル）

```bash
# WSL2 ターミナルで
tail -f /var/log/hyperpool/daily.log
tail -f /var/log/hyperpool/keeper.log

# 直近 100 行
tail -100 /var/log/hyperpool/daily.log | less
```

---

## コード更新（git pull）

スクリプトや deployment JSON の変更をリポジトリから取得:

```bash
sudo -u hyperpool bash -c '
  cd /opt/hyperpool/hyper_evm
  git pull origin main
  cd frontend && npm ci
'
```

---

## トラブルシューティング

| 症状 | 確認事項 |
|------|---------|
| `ERROR: env file not found` | `/etc/hyperpool/env` が存在するか。`sudo ls /etc/hyperpool/env` |
| `MAIN_PRIVATE_KEY` 未設定エラー | `sudo nano /etc/hyperpool/env` で値を確認 |
| `node: command not found` | `node -v` で Node 20 以上が入っているか確認。`which node` で PATH を確認 |
| `npm ci` 失敗 | `cd /opt/hyperpool/hyper_evm/frontend && sudo -u hyperpool npm ci` を再実行 |
| git push 失敗 | Deploy key の write 権限確認。`sudo -u hyperpool ssh -T git@github.com` |
| cron が動かない | `service cron status`。停止中なら `sudo service cron start` |
| Windows 再起動後に cron 停止 | Task Scheduler の `HyperpoolWSLCron` タスクを手動で一度実行: `Start-ScheduledTask -TaskName "HyperpoolWSLCron"` |
| keeper が失敗する | `MAIN_PRIVATE_KEY` のウォレットに HYPE ガス残高があるか確認 |
| Vercel に反映されない | git push が成功しているか `tail /var/log/hyperpool/daily.log` で確認。失敗していたら `VERCEL_DEPLOY_HOOK` を env に設定してフォールバック |

---

## 関連ドキュメント

- [vps-cron.md](./vps-cron.md) — Linux VPS 版（構造は共通）
- [local-mac-cron.md](./local-mac-cron.md) — Mac cron（移行元）
- [チェックリスト.md](./チェックリスト.md)
