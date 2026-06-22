# HTMLレポート生成・GCS配信 — スターターキット

Claude Codeが生成するHTMLレポートを、統一スタイルで作成し、GCS（Google Cloud Storage）にアップロードしてチーム共有するシステムです。

## 特徴

- **統一スタイル** — 全レポートが同じ配色・レイアウトで視認性を統一
- **GCS配信** — アップロード1コマンドでチームにURL共有可能
- **IAMアクセス制御** — GCSバケットのIAMでメンバー限定閲覧
- **カテゴリ分類** — レポート種別ごとにGCSパスを分類管理
- **Claude Code連携** — CLAUDE.md + memoryで生成→アップロード→共有を自動化

## セットアップ

### 1. GCPプロジェクト準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または既存を使用）
2. Cloud Storage API を有効化
3. `gcloud auth login` でCLI認証

### 2. GCSバケット作成

```bash
# バケット作成（リージョンは適宜変更）
gcloud storage buckets create gs://YOUR-BUCKET-NAME \
  --location=asia-northeast1 \
  --uniform-bucket-level-access

# 均一バケットレベルアクセスを有効化（推奨）
gcloud storage buckets update gs://YOUR-BUCKET-NAME \
  --uniform-bucket-level-access
```

### 3. IAM権限設定

```bash
# 管理者（レポート作成者）にobjectAdmin付与
gcloud storage buckets add-iam-policy-binding gs://YOUR-BUCKET-NAME \
  --member="user:admin@your-company.co.jp" \
  --role="roles/storage.objectAdmin"

# 閲覧者（チームメンバー）にobjectViewer付与
gcloud storage buckets add-iam-policy-binding gs://YOUR-BUCKET-NAME \
  --member="user:member@your-company.co.jp" \
  --role="roles/storage.objectViewer"
```

### 4. 設定ファイルの変更

`services/report_publisher.py` を開いて以下を自社環境に変更:

| 定数 | 変更内容 |
|:--|:--|
| `BUCKET` | GCSバケット名 |
| `AUTHUSER` | Googleアカウントの `authuser` パラメータ（通常は `1`） |
| `CATEGORIES` | レポートカテゴリの追加・変更 |

### 5. 依存関係インストール

```bash
pip install -r requirements.txt
```

（`gcloud` CLIは別途インストールが必要です）

## ファイル構成

```
html-report-starter/
├── README.md                   ← この説明書
├── CLAUDE.md                   ← Claude Code用指示書
├── memory/
│   ├── MEMORY.md               ← メモリ索引
│   ├── feedback_html_style.md  ← HTMLスタイル統一ルール（配色・レイアウト）
│   ├── feedback_unified_html_format.md  ← 統一フォーマット原則（3原則）
│   ├── feedback_open_files.md  ← ファイル生成後のopen必須ルール
│   └── feedback_gcs_authuser.md ← GCS URL共有時のauthuser付与ルール
├── services/
│   └── report_publisher.py     ← GCSアップロードヘルパー（★カスタマイズ対象）
├── styles/
│   └── common.css              ← 共通CSSテンプレート（コピー用）
├── examples/
│   └── sample_report.html      ← サンプルHTMLレポート
└── requirements.txt
```

## 使い方

### 1. HTMLレポートを生成する（Claude Codeに依頼）

Claude Codeに「○○のレポートをHTMLで作成して」と依頼すると、CLAUDE.mdとmemoryの指示に従い統一スタイルで生成します。

### 2. GCSにアップロード

```bash
# 単体アップロード
gcloud storage cp report.html gs://YOUR-BUCKET-NAME/category/report.html \
  --content-type="text/html; charset=utf-8"

# Pythonヘルパー経由
python -c "from services.report_publisher import publish_report; print(publish_report('report.html', 'operations/todo'))"

# 全レポート一括アップロード
python -m services.report_publisher
```

### 3. URLをチームに共有

アップロード後のURLに `?authuser=1` を付与して共有:

```
https://storage.cloud.google.com/YOUR-BUCKET-NAME/category/report.html?authuser=1
```

## GCSカテゴリ一覧

| カテゴリパス | 用途 | 例 |
|:--|:--|:--|
| `operations/inbox-review/` | メールトリアージレポート | inbox_review_20260330.html |
| `operations/todo/` | メンバー別TODOリスト | todo_by_member_20260328.html |
| `operations/patent/` | 特許情報レポート | 特許情報_状況レポート.html |
| `operations/work-log/` | 稼働ログ | work_log_20260326.html |
| `cases/{case-slug}/` | 案件別レポート | yahagi_highlight_report.html |
| `infrastructure/slack/` | Slack監査・マスター | slack_channel_master.html |
| `infrastructure/principle-extraction/` | 原則抽出結果 | principle_review_v3.html |

カテゴリは自由に追加できます。`services/report_publisher.py` の `CATEGORIES` に追加してください。

## 資料の3要素（必須原則）

全てのレポート・資料には以下の3要素を含めること。これが揃っていない資料は「情報の羅列」であり、読者に行動を促せない。

| 要素 | 内容 | HTML上の配置 |
|:--|:--|:--|
| テーマ | この資料は何について書かれているか | `<h1>` タイトル |
| 結論 | 読者に最初に伝えるべき判断・事実 | `.conclusion` — サマリーより上 |
| 期待するアクション | 読者に何をしてほしいか | `.action-items` — 資料末尾 |

### HTML構成の順序

```
テーマ (h1)
  ↓
結論 (.conclusion) ← サマリーより上に配置
  ↓
サマリー (.summary-box)
  ↓
詳細 (table / card)
  ↓
確認・依頼事項 (.action-items) ← 末尾に必ず配置
  ↓
フッター (.report-footer)
```

### Claude Codeによる教育的問いかけ

Claude Codeでレポート生成を依頼する際、3要素が明示されていなければ、生成前に以下のような問いかけを行います:

- 「この資料の結論はどうお考えですか？」
- 「読者にどのアクションを期待していますか？」

これはエージェントシステムの設計原則です。単に便利すぎると依頼者の思考力が退化するため、適度な負荷（自分で考えさせる問いかけ）を与えて能力を維持・向上させます。

## PDF変換

HTMLをPDFに変換する際は、ブラウザが自動付与するヘッダー（URL）・フッター（日付・ページ番号）を削除してください。`styles/common.css` に `@media print` ルールが含まれていますが、ブラウザの印刷設定でも「ヘッダーとフッター」のチェックを外す必要があります。

## HTMLスタイルガイド

全レポートで以下のスタイルを統一しています:

| 要素 | 値 |
|:--|:--|
| 背景（body） | `#f8f9fa` |
| 背景（カード/テーブル） | `#fff` |
| テキスト（本文） | `#333` |
| テキスト（見出し） | `#16213e` |
| テキスト（補助） | `#888` |
| テーブルヘッダ | `#16213e`背景 + 白文字 |
| 偶数行 | `#f2f2f2` |
| カード | 白背景 + `border: #e0e0e0` + `box-shadow: 0 1px 3px rgba(0,0,0,0.08)` |
| バッジ | pill型 `border-radius: 10px-12px` |
| バッジ色 | 緑`#e8f5e9` / 黄`#fff3cd` / 赤`#ffcdd2` / 青`#e3f2fd` |
| フォント | `-apple-system, sans-serif` / `Menlo, monospace`（コード） |
| レイアウト | `max-width: 1100px`, `margin: 0 auto`, `padding: 40px 20px` |

詳細は `styles/common.css` を参照してください。

## authuser パラメータについて

GCS（`storage.cloud.google.com`）のURLは、ブラウザに複数のGoogleアカウントがログインしている場合、デフォルトアカウント（authuser=0）で認証されます。社用アカウントが2番目（authuser=1）の場合、明示的に `?authuser=1` を付与しないと403エラーになります。

チームの環境に合わせて `services/report_publisher.py` の `AUTHUSER` を調整してください。
