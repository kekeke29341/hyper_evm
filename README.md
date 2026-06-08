# Project X (HyperEVM DEX)

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
| [architecture.md](docs/architecture.md) | システム構成 |
| [development.md](docs/development.md) | ローカル開発 |
| [deployment.md](docs/deployment.md) | デプロイ |
| [testing.md](docs/testing.md) | テスト・CI |
| [handover.md](docs/handover.md) | **引き継ぎ** |

## CI/CD

`.github/workflows/ci.yml` — push/PR で Forge / Vitest / Playwright / ABI sync を実行。
