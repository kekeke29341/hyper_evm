# テストガイド

## 概要

| レイヤー | フレームワーク | テスト数（目安） |
|---------|--------------|----------------|
| スマートコントラクト | Foundry (Forge) | 28 |
| フロントエンド単体 | Vitest + Testing Library | 25 |
| E2E | Playwright | 3 |

## 一括実行

```bash
./scripts/test-all.sh
# または
make test
```

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
forge test --match-path test/MerkleAirdropTest.t.sol

# Testnet フォーク（RPC 必要、CI ではスキップ）
FORK_TEST=true forge test --match-test testFork_HyperEVMTestnet
```

### テストファイル

| ファイル | 対象 |
|---------|------|
| `test/ProjectXTest.t.sol` | 統合（swap, LP, points, referral, gas limit） |
| `test/MerkleAirdropTest.t.sol` | Cashdrop claim / revert 系 |
| `test/ReferralRegistryTest.t.sol` | 紹介コード・ブースト |
| `test/PoolMathExtendedTest.t.sol` | AMM 数学 |

### プリコンパイル Mock

`ProjectXTest` は 2 方式をサポート:

- デフォルト: `vm.mockCall`
- `USE_ETCH_MOCKS=true`: `vm.etch` でプリコンパイルアドレスに Mock 注入

## フロントエンド

```bash
cd frontend

npm run test              # Vitest 一括
npm run test:watch        # watch モード
npm run test:coverage     # カバレッジレポート
npm run typecheck         # tsc --noEmit
npm run lint              # ESLint
```

### テスト配置

```
frontend/src/
├── lib/__tests__/           # utils, merkle, lifi config
├── app/api/lifi/*/route.test.ts
└── components/tabs/__tests__/
```

## E2E (Playwright)

```bash
cd frontend

# build 済みアプリに対して実行（webServer 自動起動）
npm run build
npm run test:e2e

# UI モード
npm run test:e2e:ui
```

E2E はオンボーディングモーダルを `localStorage` でスキップします（`prjx_onboarding_done=1`）。

## CI/CD

`.github/workflows/ci.yml` — push / PR で自動実行:

1. **contracts** — build, test, fmt check (`test/`)
2. **frontend** — lint, typecheck, Vitest, build
3. **e2e** — Playwright smoke
4. **sync-abi** — ABI 差分検出

ローカルで CI と同等の確認:

```bash
make ci-local   # test + build + lint（Makefile 参照）
```

## カバレッジ目標

Vitest coverage thresholds（`vitest.config.ts`）:

- lines / functions / statements: 15%+
- branches: 10%+

今後の拡張候補: `useDeFi` hooks、`SwapTab` コンポーネント、Admin パネル。
