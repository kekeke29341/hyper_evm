# Hyperpool — ドキュメント索引

このディレクトリには、開発・運用・引き継ぎに必要な資料を集約しています。

## 運営・本番運用（最重要）

| フォルダ | 対象 | 内容 |
|---------|------|------|
| **[本番運用/](./本番運用/README.md)** | **運営・DevOps** | **Testnet E2E、Vault LP、keeper、cron、チェックリスト** |

## ドキュメント一覧

| ファイル | 対象読者 | 内容 |
|---------|---------|------|
| [app-overview.md](./app-overview.md) | **全員（最初に読む）** | **アプリ全体の説明・機能・構成・運用の入口** |
| [hyperpool-guide.html](./hyperpool-guide.html) | **全員 / 運営** | **HTML 完全ガイド（初心者〜上級者 + 運営引き継ぎ）** |
| [product-overview.md](./product-overview.md) | **全員（Product）** | **手数料・ポイント・日次収益の更新仕様** |
| [architecture.md](./architecture.md) | 開発者・アーキテクト | システム全体像、コントラクト役割、データフロー |
| [development.md](./development.md) | 開発者 | ローカル環境構築、日常開発フロー |
| [deployment.md](./deployment.md) | DevOps / 開発者 | Testnet・Mainnet デプロイ手順 |
| [vercel.md](./vercel.md) | DevOps / 開発者 | Vercel フロント公開（GitHub 連携） |
| [testing.md](./testing.md) | 開発者・QA | 単体・E2E テスト、CI パイプライン |
| [handover.md](./handover.md) | **新規担当者** | 引き継ぎチェックリスト、既知の注意点 |
| [admin-guide.md](./admin-guide.md) | **オーナー・運用者** | **Admin ダッシュボード・オンチェーン運用手順** |

## その他の参考資料

| パス | 内容 |
|------|------|
| [../README.md](../README.md) | リポジトリ概要・クイックスタート |
| [cursor_instructions/platform_instruct.txt](./cursor_instructions/platform_instruct.txt) | UI/UX 要件の原文（Product 仕様） |
| [../frontend/README.md](../frontend/README.md) | フロントエンド専用メモ |
| [../.github/workflows/ci.yml](../.github/workflows/ci.yml) | CI 定義 |

## 推奨読了順（新規参加者）

1. ルート [README.md](../README.md) — クイックスタート
2. **[本番運用/README.md](./本番運用/README.md)** — **運営担当はここ（デプロイ済み vs 未完了）**
3. [app-overview.md](./app-overview.md) — このアプリとは何か（入口）
4. [product-overview.md](./product-overview.md) — 手数料・ポイント・収益更新
5. [architecture.md](./architecture.md) — 技術構成
6. [development.md](./development.md) — 手を動かす
7. [handover.md](./handover.md) — 引き継ぎ項目の確認
