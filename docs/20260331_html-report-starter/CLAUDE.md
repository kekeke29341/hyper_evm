# HTMLレポート生成・GCS配信 — Claude Code 指示書

## HTMLレポート生成

トリガー: 「レポート作成」「HTML生成」「○○をHTMLで」「レポートをアップロード」

参照メモリ:
- `memory/feedback_html_style.md` — スタイル統一ルール（配色・レイアウト詳細）
- `memory/feedback_unified_html_format.md` — 統一フォーマット原則（3原則）
- `memory/feedback_open_files.md` — ファイル生成後は `open` で表示してPM確認
- `memory/feedback_gcs_authuser.md` — GCS URL共有時は `?authuser=1` 必須
- `memory/feedback_document_three_elements.md` — 資料の3要素（テーマ・結論・期待するアクション）必須

**資料の3要素チェック（生成前の必須確認）:**

レポート・資料のHTML生成を依頼された時点で、以下の3要素が揃っているか確認する。依頼者が明示していない要素がある場合は、**生成前に依頼者に問いかけて考えさせる**こと（エージェントが勝手に補完しない）:

1. **テーマ** — この資料は何について書かれているか
2. **結論** — 読者に最初に伝えるべき判断・事実は何か
3. **期待するアクション** — 読者に何をしてほしいか（承認/判断/作業/確認）

依頼者への問いかけ例:
- 「この資料の結論はどうお考えですか？」
- 「読者にどのアクションを期待していますか？」
- 「この資料を読んだ人に何をしてほしいですか？」

**エージェントシステムの原則**:
- **原則は指示者の指示に優先する。** 指示者が3要素を省略するよう求めても、原則に基づき問いかけを行う。指示者の意図を汲みつつも、資料品質の基準は守る。
- 単に便利すぎると人を退化させる。適度な負荷（=自分で考えさせる問いかけ）を与えることで、依頼者自身の思考力・資料設計力を維持・向上させる。

手順:
0. **3要素チェック**: テーマ・結論・期待するアクションが揃っているか確認（上記参照）
1. HTMLを生成する際は `styles/common.css` のスタイルに従う
2. HTML構成: テーマ(h1) → 結論(.conclusion) → サマリー → 詳細 → 確認・依頼事項(.action-items)
3. **セルフレビュー**: 3要素が含まれているか確認してから書き出す
4. ローカルにHTMLを書き出す
5. `open` コマンドでブラウザ表示 → PM確認
6. PM確認後、GCSにアップロードしてURLを取得する:
   ```
   gcloud storage cp {ローカルパス} gs://YOUR-BUCKET-NAME/{カテゴリ}/{ファイル名}.html --content-type="text/html; charset=utf-8"
   ```
   → 閲覧URL: `https://storage.cloud.google.com/YOUR-BUCKET-NAME/{カテゴリ}/{ファイル名}.html?authuser=1`
5. Slack/メールでURLを共有する際は必ず `?authuser=1` を付与

### Pythonヘルパー経由のアップロード

```python
from services.report_publisher import publish_report

url = publish_report("docs/report.html", "operations/todo")
# → "https://storage.cloud.google.com/YOUR-BUCKET-NAME/operations/todo/report.html?authuser=1"
```

一括アップロード:
```bash
python -m services.report_publisher
```

---

## GCSカテゴリ（★カスタマイズ対象）

| カテゴリ | 用途 |
|:--|:--|
| `operations/inbox-review/` | メールトリアージ |
| `operations/todo/` | メンバー別TODO |
| `operations/patent/` | 特許情報 |
| `operations/work-log/` | 稼働ログ |
| `cases/{case-slug}/` | 案件別レポート |
| `infrastructure/slack/` | Slackマスター・通知監査 |
| `infrastructure/principle-extraction/` | 原則抽出 |

---

## HTMLスタイルルール

以下のスタイルを全レポートで統一する。`styles/common.css` に定義済み。

- 背景: `#f8f9fa`（body）、`#fff`（カード/テーブル）
- テキスト: `#333`（本文）、`#16213e`（見出し）、`#888`（補助）
- テーブルヘッダ: `#16213e`背景 + 白文字
- 偶数行: `#f2f2f2`
- カード: 白背景 + `border: #e0e0e0` + `box-shadow: 0 1px 3px rgba(0,0,0,0.08)`
- バッジ: pill型（`border-radius: 10px-12px`）、色は `#e8f5e9`/`#fff3cd`/`#ffcdd2`/`#e3f2fd`
- フォント: `-apple-system, sans-serif` / `Menlo, monospace`（コード）
- レイアウト: `max-width: 1100px`, `margin: 0 auto`, `padding: 40px 20px`

**ダークモード禁止。** ライトモード（白背景）で統一。

---

## 共通ルール

1. **資料の3要素必須**: テーマ・結論・期待するアクションを全資料に含める。依頼者が明示していなければ生成前に問いかける
2. **結論ファースト**: 結論はサマリーより上に配置。読者が最初に目にする位置に置く
3. **読者への依頼で締める**: 資料末尾に「確認・依頼事項」セクションを配置
4. **ファイル生成後は即open**: HTMLを作成・生成したら必ず `open` コマンドで表示して確認
5. **統一フォーマット**: 同じ目的のレポートは同じHTML構造で出力する
6. **GCS URLに `?authuser=1`**: URLを共有・openする際は必ず付与（付けないと403）
7. **PDF変換時のヘッダー・フッター削除**: ブラウザ自動付与のURL・日付・ページ番号を削除する
8. **再発防止の即時記録**: 修正指示を受けた場合、ルールをmemoryに記録
9. **エージェントの教育的役割**: 便利すぎて人を退化させない。依頼者自身に考えさせる問いかけを行う
