# 本番運用ドキュメント

運営・DevOps が **Testnet / 本番環境をユーザーが使える状態にする** ために必要な作業をまとめています。

> **運営担当はまずここを読んでください。** 開発者向けの細部は [deployment.md](../deployment.md)・[vercel.md](../vercel.md)・[admin-guide.md](../admin-guide.md) を参照。

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [現状と全体像.md](./現状と全体像.md) | 2 層構造（Vercel + Vault LP）、機能別の運営作業 |
| [テストネット運用.md](./テストネット運用.md) | **998 デプロイ済みの現状**・スクリプト一覧・cron |
| [本番環境運用.md](./本番環境運用.md) | Mainnet (999) 公開前の準備 |
| [チェックリスト.md](./チェックリスト.md) | コピペ用チェックリスト |
| [github-actions-cron.md](./github-actions-cron.md) | keeper / 日次 Cashdrop の GitHub Actions 設定 |
| [local-mac-cron.md](./local-mac-cron.md) | **暫定: 手元 Mac crontab 運用**（GitHub 課金不可時） |
| [運営確認事項_お客様向け.md](./運営確認事項_お客様向け.md) | **お客様・ビジネス向け Q&A**（収益分配・Cashdrop・紹介・法務・公開判断） |
| [運営確認事項.md](./運営確認事項.md) | **開発・DevOps 向け Q&A**（cron・env・アドレス・immutable パラメータ等） |
| [検証手順.md](./検証手順.md) | **手動検証**（Vercel Redeploy・MetaMask・Position） |

## 30 秒サマリー

| 質問 | 答え |
|------|------|
| Testnet にコントラクトはある？ | **ある**（Chain 998、HyperpoolVault + Mock NPM） |
| Mainnet (999) にコントラクトはある？ | **未デプロイ**（`999.json` は `deployed: false`） |
| いま Vault LP は動く？ | **CLI E2E 検証済み**。GUI はウォレット接続 + Vercel Redeploy 後 |
| Cashdrop | 毎日 JST 7:00 の `daily-rewards.mjs` で対象者へUSDC自動送金 |
| USDC 手数料 harvest | **998 では不完全**（本物 USDC mint 不可）→ mainnet で本番検証 |

## 最短で Testnet E2E を再実行

```bash
source scripts/testnet-env.sh
./scripts/testnet-run-all.sh
```

初回 Vault セットアップ:

```bash
source scripts/testnet-env.sh
node scripts/testnet-post-deploy.mjs
node scripts/testnet-sync-shareholders.mjs
node scripts/sync-abi.mjs
```

## 関連リンク

- 公開 UI: https://hyper-evm-ten.vercel.app
- Testnet Explorer: https://testnet.purrsec.com
- Testnet ガス: https://app.hyperliquid-testnet.xyz/drip
