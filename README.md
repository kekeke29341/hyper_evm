# Hyperpool (HyperEVM DEX)

HyperEVM エコシステム向け AMM DEX + Next.js フロントエンドのモノレポ。  
Swap / Liquidity / Points / Affiliate / Cashdrop / Li.FI ブリッジを提供します。

## Quick start

```bash
git clone --recurse-submodules <repo-url>
cd hyper_evm && cd frontend && npm ci && cd ..
./scripts/dev-local.sh   # → http://localhost:3000
```

MetaMask: Chain ID **31337**, RPC `http://127.0.0.1:8545`

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Anvil + deploy + frontend |
| `make test` | Forge + Vitest + typecheck |
| `make sync-abi` | Sync contract ABIs |

## Networks

| Env | Chain ID |
|-----|----------|
| Local (Anvil) | 31337 |
| HyperEVM Testnet | 998 |
| HyperEVM Mainnet | 999 |

## Documentation

詳細は [docs/README.md](docs/README.md) を参照。

| Doc | Topic |
|-----|-------|
| [app-overview.md](docs/app-overview.md) | **アプリ全体の説明（入口）** |
| [product-overview.md](docs/product-overview.md) | 手数料・ポイント・日次収益 |
| [architecture.md](docs/architecture.md) | システム構成 |
| [development.md](docs/development.md) | ローカル開発 |
| [deployment.md](docs/deployment.md) | コントラクトデプロイ |
| [vercel.md](docs/vercel.md) | **Vercel フロント公開** |
| [testing.md](docs/testing.md) | テスト・CI |
| [handover.md](docs/handover.md) | **引き継ぎ** |

## CI/CD

`.github/workflows/ci.yml` — push/PR で Forge / Vitest / Playwright / ABI sync を実行。

## Vercel（フロントエンド公開）

Testnet 向けフロントを Vercel に載せる手順: **[docs/vercel.md](docs/vercel.md)**

1. GitHub に push（リモート未設定の場合は `git remote add origin …`）
2. Vercel → Import → **Root Directory: `frontend`**
3. 環境変数を `frontend/.env.vercel.example` 参照で設定
4. Deploy

```bash
git check-ignore -v .env.testnet   # 秘密鍵ファイルが ignore されていることを確認
```
