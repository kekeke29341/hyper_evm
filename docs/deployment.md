# デプロイガイド

## Testnet

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
