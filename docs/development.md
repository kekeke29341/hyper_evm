# ローカル開発ガイド

## 環境セットアップ

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
git clone --recurse-submodules <repo-url>
cd hyper_evm && cd frontend && npm ci
```

## ローカルスタック

```bash
make dev
```

Anvil (31337) + デプロイ + ABI 同期 + `npm run dev`

### MetaMask

| 項目 | 値 |
|------|-----|
| RPC | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Symbol | HYPE |

## 環境変数

`cp frontend/.env.local.example frontend/.env.local`

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| deploy スキップ | rm contracts/anvil-state.json |
| ABI 古い | make sync-abi |
