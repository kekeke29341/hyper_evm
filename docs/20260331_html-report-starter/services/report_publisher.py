"""HTMLレポートをGCSにアップロードしてURL共有可能にするヘルパー

使い方:
    from services.report_publisher import publish_report

    url = publish_report(
        local_path="docs/todo_by_member_20260328.html",
        category="operations/todo"
    )
    # → "https://storage.cloud.google.com/YOUR-BUCKET-NAME/operations/todo/todo_by_member_20260328.html?authuser=1"

一括アップロード:
    python -m services.report_publisher
"""

import subprocess
from pathlib import Path

# =====================================================================
# ■ カスタマイズ必須: 自社環境に合わせて変更してください
# =====================================================================

# GCSバケット名
BUCKET = "your-bucket-name"  # ← 変更必須

# authuser パラメータ（ブラウザでのGoogleアカウント順序に合わせる）
# 社用アカウントが2番目にログインしている場合は 1
AUTHUSER = 1

# =====================================================================
# ■ カスタマイズ推奨: カテゴリの追加・変更
# =====================================================================

# GCSのカテゴリ分類（glob パターン → カテゴリパス）
# publish_all_reports() で使用
CATEGORIES = {
    "operations/inbox-review": ["inbox_review_*.html"],
    "operations/todo": ["docs/todo_*.html"],
    "operations/work-log": ["docs/work_log_*.html"],
    # ← 運用しながら追加
}

# =====================================================================
# ■ ロジック（変更不要）
# =====================================================================

BASE_URL = f"https://storage.cloud.google.com/{BUCKET}"


def publish_report(local_path: str, category: str) -> str:
    """HTMLレポートをGCSにアップロードし、閲覧URLを返す。

    Args:
        local_path: ローカルのHTMLファイルパス
        category: GCSのカテゴリパス（例: "operations/todo", "cases/omron-llm"）

    Returns:
        閲覧URL（?authuser付き）
    """
    filepath = Path(local_path)
    if not filepath.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    gcs_path = f"gs://{BUCKET}/{category}/{filepath.name}"
    url = f"{BASE_URL}/{category}/{filepath.name}?authuser={AUTHUSER}"

    result = subprocess.run(
        [
            "gcloud", "storage", "cp",
            str(filepath),
            gcs_path,
            "--content-type=text/html; charset=utf-8",
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Upload failed: {result.stderr}")

    return url


def publish_all_reports(base_dir: str = ".") -> dict:
    """CATEGORIESに基づいて全レポートをGCSにアップロードする。

    Returns:
        {category: [url, ...]} の辞書
    """
    base = Path(base_dir)
    results = {}

    for category, patterns in CATEGORIES.items():
        urls = []
        for pattern in patterns:
            for f in base.glob(pattern):
                try:
                    url = publish_report(str(f), category)
                    urls.append(url)
                    print(f"  ✓ {url}")
                except Exception as e:
                    print(f"  ✗ {f.name}: {e}")
        if urls:
            results[category] = urls

    return results


if __name__ == "__main__":
    import sys
    base = sys.argv[1] if len(sys.argv) > 1 else "."
    print(f"Publishing all reports from {base}...")
    print()
    results = publish_all_reports(base)
    print()
    total = sum(len(v) for v in results.values())
    print(f"Done: {total} files uploaded to {len(results)} categories")
