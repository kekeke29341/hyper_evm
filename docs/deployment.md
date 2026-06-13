# デプロイガイド

## フロントエンド（Vercel）

Testnet / 本番 UI は Vercel にデプロイします。詳細は **[vercel.md](./vercel.md)**。

- Root Directory: `frontend`
- コントラクト ABI / `998.json` はリポジトリに同梱（再ビルド不要）
- `PRIVATE_KEY` は Vercel に設定しない

## Testnet（コントラクト）

```bash
export PRIVATE_KEY=0x...
./scripts/deploy-testnet.sh
```

## Mainnet

```bash
export PRIVATE_KEY=0x...
./scripts/deploy-mainnet.sh
```

## デプロイ後

```bash
node scripts/sync-abi.mjs
```
