---
name: GCS URL共有時のauthuserパラメータ必須
description: GCS HTMLレポートのURLを共有・openする際は ?authuser=1 を必ず付与。付けないと403エラーになる
type: feedback
---

GCS (`storage.cloud.google.com`) のURLを共有・ブラウザで開く際は、必ず `?authuser=1` を末尾に付与する。

**Why:** `storage.cloud.google.com` はGoogleアカウントのCookie認証を使う。ブラウザに複数Googleアカウントがログインしている場合、デフォルトアカウント（authuser=0）にIAM権限がないと403になる。社用アカウントが2番目にログインされている場合、明示的な指定が必要。

**How to apply:**
- `open` コマンドでGCS URLを開くとき: `?authuser=1` を付ける
- Slack/メールでURL共有するとき: `?authuser=1` を付ける
- HTMLレポート内にGCSリンクを埋め込むとき: 同様に付ける
- `AUTHUSER` 定数はチームの環境に合わせて調整する
