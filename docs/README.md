# Project X — ドキュメント索引

このディレクトリには、開発・運用・引き継ぎに必要な資料を集約しています。

## ドキュメント一覧

| ファイル | 対象読者 | 内容 |
|---------|---------|------|
| [product-overview.md](./product-overview.md) | **全員（Product）** | **アプリ概要・手数料・日次収益の更新仕様** |
| [architecture.md](./architecture.md) | 開発者・アーキテクト | システム全体像、コントラクト役割、データフロー |
| [development.md](./development.md) | 開発者 | ローカル環境構築、日常開発フロー |
| [deployment.md](./deployment.md) | DevOps / 開発者 | Testnet・Mainnet デプロイ手順 |
| [vercel.md](./vercel.md) | DevOps / 開発者 | Vercel フロント公開（GitHub 連携） |
| [testing.md](./testing.md) | 開発者・QA | 単体・E2E テスト、CI パイプライン |
| [handover.md](./handover.md) | **新規担当者** | 引き継ぎチェックリスト、既知の注意点 |

## その他の参考資料

| パス | 内容 |
|------|------|
| [../README.md](../README.md) | リポジトリ概要・クイックスタート |
| [cursor_instructions/platform_instruct.txt](./cursor_instructions/platform_instruct.txt) | UI/UX 要件の原文（Product 仕様） |
| [../frontend/README.md](../frontend/README.md) | フロントエンド専用メモ |
| [../.github/workflows/ci.yml](../.github/workflows/ci.yml) | CI 定義 |

## 推奨読了順（新規参加者）

1. ルート [README.md](../README.md) — 全体像
2. [product-overview.md](./product-overview.md) — **アプリとは何か・手数料・収益更新**
3. [architecture.md](./architecture.md) — 技術構成
4. [development.md](./development.md) — 手を動かす
5. [handover.md](./handover.md) — 引き継ぎ項目の確認
