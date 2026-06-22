# テストガイド

## 概要

| レイヤー | フレームワーク | テスト数（目安） |
|---------|--------------|----------------|
| スマートコントラクト | Foundry (Forge) | 52 |
| フロントエンド単体 | Vitest + Testing Library | 50 |
| E2E | Playwright smoke | 13 |
| Testnet on-chain | CLI スクリプト | 下記参照 |

## 一括実行

```bash
./scripts/test-all.sh
# または
make test
```

## Testnet on-chain E2E

`.env.testnet` に `MAIN_PRIVATE_KEY` を設定後:

```bash
source scripts/testnet-env.sh

# 一括
./scripts/testnet-run-all.sh

# 個別
node scripts/verify-testnet.mjs
cd frontend && npm run verify:testnet
node scripts/testnet-vault-smoke.mjs
DEPLOYMENT_CHAIN=998 SKIP_ORACLE=1 node scripts/keeper-rebalance.mjs
FEE_WHYPE=0.01 FEE_USDC=0 node scripts/testnet-accrue-fees.mjs
DEPLOYMENT_CHAIN=998 node scripts/daily-rewards.mjs
POOL_USDC=0.01 node scripts/testnet-daily-rewards-smoke.mjs
node scripts/testnet-wallet-actions.mjs
```

詳細: [本番運用/テストネット運用.md](./本番運用/テストネット運用.md)

## スマートコントラクト

```bash
cd contracts

# 全テスト
forge test

# 詳細ログ
forge test -vvv

# CI プロファイル（fuzz 256 runs）
FOUNDRY_PROFILE=ci forge test

# 特定ファイル
forge test --match-path test/HyperpoolVaultTest.t.sol
forge test --match-path test/ProjectXAdapterTest.t.sol
```

### テストファイル

| ファイル | 対象 |
|---------|------|
| `test/HyperpoolVaultTest.t.sol` | Vault deposit/withdraw/harvest/rebalance |
| `test/ProjectXAdapterTest.t.sol` | Adapter + Mock NPM / pool NAV 統合 |
| `test/ProjectXPriceTest.t.sol` | Project X 価格・tick 変換 |
| `test/MerkleAirdropTest.t.sol` | Cashdrop claim / revert 系 |
| `test/ReferralRegistryTest.t.sol` | 紹介コード登録・紐付け |

## フロントエンド

```bash
cd frontend

npm run test              # Vitest 一括
npm run test:watch        # watch モード
npm run test:coverage     # カバレッジレポート
npm run typecheck         # tsc --noEmit
npm run lint              # ESLint
npm run verify:testnet    # on-chain smoke（要 testnet-env）
```

### テスト配置

```
frontend/src/
├── lib/__tests__/           # utils, merkle, lifi config, earnings
├── app/api/lifi/*/route.test.ts
└── components/tabs/__tests__/
```

## E2E (Playwright)

```bash
cd frontend

npm run build
npm run test:e2e
npm run test:e2e:ui   # UI モード
```

## CI/CD

`.github/workflows/ci.yml` — push / PR で自動実行:

1. **contracts** — build, test, fmt check
2. **frontend** — lint, typecheck, Vitest, build
3. **e2e** — Playwright smoke
4. **sync-abi** — ABI 差分検出

ローカルで CI と同等:

```bash
make ci-local
```

## カバレッジ目標

Vitest coverage thresholds（`vitest.config.ts`）:

- lines / functions / statements: 15%+
- branches: 10%+
