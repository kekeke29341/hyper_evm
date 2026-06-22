# Vercel デプロイガイド

Hyperpool フロントエンドを Vercel に公開する手順です。  
**スマートコントラクトは Vercel ではデプロイしません**（既に HyperEVM Testnet 998 にデプロイ済み）。

## 1. GitHub リポジトリ作成

ローカルには `main` ブランチとコミット履歴がありますが、**リモートは未設定**です。

```bash
cd hyper_evm

# 秘密情報が含まれていないか確認（.env.testnet は .gitignore 済み）
git status
git check-ignore -v .env.testnet   # → .gitignore に載っていること

# GitHub で空リポジトリを作成後（例: your-org/hyper_evm）
git remote add origin git@github.com:YOUR_ORG/hyper_evm.git
git push -u origin main
```

初回 push 前にコミットが必要な場合:

```bash
git add -A
git status   # .env.testnet / node_modules / .cache-synpress が含まれていないこと
git commit -m "Prepare frontend for Vercel testnet deployment"
git push -u origin main
```

## 2. Vercel プロジェクト設定

1. [vercel.com](https://vercel.com) → **Add New Project** → GitHub リポジトリを Import
2. **Root Directory**: `frontend` に変更（重要）
3. Framework: **Next.js**（自動検出）
4. Build / Install: `vercel.json` の `npm ci` + `npm run build` を使用

| 項目 | 値 |
|------|-----|
| Root Directory | `frontend` |
| Node.js | 20.x（推奨） |
| Build Command | `npm run build` |
| Output | Next.js デフォルト |

## 3. 環境変数（Vercel Dashboard → Settings → Environment Variables）

### Testnet プレビュー（推奨 — 現状のデプロイに合わせる）

| Variable | Value | Environments |
|----------|-------|--------------|
| `NEXT_PUBLIC_DEFAULT_CHAIN_ID` | `998` | Production, Preview, Development |
| `NEXT_PUBLIC_TESTNET_RPC` | `https://rpcs.chain.link/hyperevm/testnet` | 同上 |
| `NEXT_PUBLIC_MAINNET_RPC` | `https://rpc.hyperliquid.xyz/evm` | 同上 |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | （[cloud.reown.com](https://cloud.reown.com) で取得） | 同上 |
| `NEXT_PUBLIC_LIFI_INTEGRATOR` | `hyperpool` | 同上 |
| `LIFI_INTEGRATOR` | `hyperpool` | 同上 |
| `NEXT_PUBLIC_ADMIN_ENABLED` | `false` | **Production** |
| `NEXT_PUBLIC_ADMIN_ENABLED` | `true` | **Preview** のみ（任意） |

> **Admin**: `NEXT_PUBLIC_ADMIN_ENABLED` はビルド時に焼き込まれます。公開 URL では `false`、プレビュー branch のみ `true` にするのが安全です。

### Mainnet 本番（将来）

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_DEFAULT_CHAIN_ID` | `999` |
| `NEXT_PUBLIC_ADMIN_ENABLED` | `false` |

**Vercel に設定しないもの**（絶対に Server/Client env に入れない）:

- `PRIVATE_KEY` / `MAIN_PRIVATE_KEY`
- `.env.testnet`

## 4. WalletConnect 許可ドメイン

Reown Cloud で Project ID 作成後、**Allowed Domains** に追加:

- `localhost:3000`
- `*.vercel.app`
- カスタムドメイン（設定後）

## 5. デプロイ後チェックリスト

- [ ] トップページが表示される（Undeployed バナーなし）
- [ ] ネットワークが **HyperEVM Testnet (998)** になっている
- [ ] MetaMask Connect → Bridge / Position / Cashdrop
- [ ] `/admin` — Preview のみ有効にした場合、Production では 404

```bash
# ローカルで Vercel と同じ env を再現
cd frontend
cp .env.local.example .env.local
# 値を編集して
npm run build && npm run start
```

## 6. カスタムドメイン（任意）

Vercel → Project → **Domains** で DNS を設定。  
WalletConnect の Allowed Domains にも追加してください。

## 7. トラブルシュート

| 症状 | 対処 |
|------|------|
| Build 失敗 | Vercel の Node を 20.x に。Root Directory が `frontend` か確認 |
| RPC エラー | `NEXT_PUBLIC_TESTNET_RPC` を Chainlink RPC に変更 |
| Admin が Production で見える | `NEXT_PUBLIC_ADMIN_ENABLED=false` で **Redeploy**（Rebuild 必須） |
| WalletConnect 失敗 | Project ID と Allowed Domains を確認 |

## 関連

- [deployment.md](./deployment.md) — コントラクトデプロイ
- [frontend/.env.local.example](../frontend/.env.local.example) — 環境変数一覧
- [frontend/vercel.json](../frontend/vercel.json) — Vercel 設定
