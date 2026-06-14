# 本番運用ドキュメント

運営・DevOps が **Testnet / 本番環境をユーザーが使える状態にする** ために必要な作業をまとめています。

> **運営担当はまずここを読んでください。** 開発者向けの細部は [deployment.md](../deployment.md)・[vercel.md](../vercel.md)・[admin-guide.md](../admin-guide.md) を参照。

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [現状と全体像.md](./現状と全体像.md) | 2 層構造（Vercel + オンチェーン）、Swap に必要なもの |
| [テストネット運用.md](./テストネット運用.md) | **998 デプロイ済みの現状**と、残りの運営作業 |
| [本番環境運用.md](./本番環境運用.md) | Mainnet (999) 公開前の準備 |
| [チェックリスト.md](./チェックリスト.md) | コピペ用チェックリスト |

## 30 秒サマリー

| 質問 | 答え |
|------|------|
| Testnet にコントラクトはある？ | **ある**（Chain 998、`998.json` 参照） |
| いま GUI で Swap できる？ | **プールが空**のため実用的には **まだ不可** |
| Swap のために運営が入れるもの | **kHYPE + USDC をペアに LP 追加**（流動性シード） |
| フロントは？ | Vercel 公開済み想定。env は `NEXT_PUBLIC_DEFAULT_CHAIN_ID=998` |
| Cashdrop | Merkle 未設定・`airdropEntries` 未同期 → **運営設定が必要** |

## 最短で Testnet を「触れる」ようにする

```bash
# 流動性 + Cashdrop 一括（.env.testnet に運営ウォレット鍵が必要）
node scripts/testnet-post-deploy.mjs

node scripts/sync-abi.mjs
git add contracts/deployments frontend/src/lib/contracts/deployments
git commit -m "Sync testnet liquidity and airdrop config"
git push
```

## 関連リンク

- 公開 UI: https://hyper-evm-ten.vercel.app
- Testnet Explorer: https://testnet.purrsec.com
- Testnet ガス: https://app.hyperliquid-testnet.xyz/drip
