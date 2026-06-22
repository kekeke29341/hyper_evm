---
name: HTML出力スタイル統一ルール
description: 全HTMLレポートはライトモードで統一。白背景・#16213e見出し・システムフォント・max-width 1100px
type: feedback
---

HTML出力ファイルはすべてライトモード（白背景）で統一する。ダークモードは使わない。

**Why:** 報告用HTMLのスタイルがバラバラだと、確認するたびに「これは何を見ればいいのか」という認知コストが発生する。統一することでPMは内容の判断に集中できる。

**How to apply:** HTML生成時は以下の共通スタイルに従う:
- 背景: #f8f9fa（body）、#fff（カード/テーブル）
- テキスト: #333（本文）、#16213e（見出し）、#888（補助）
- テーブルヘッダ: #16213e背景 + 白文字
- 偶数行: #f2f2f2
- カード: 白背景 + border #e0e0e0 + box-shadow 0 1px 3px rgba(0,0,0,0.08)
- バッジ: pill型(border-radius: 10px-12px)、色は #e8f5e9/#fff3cd/#ffcdd2/#e3f2fd
- フォント: -apple-system, sans-serif / Menlo, monospace（コード）
- max-width: 1100px, margin: 0 auto, padding: 40px 20px
