#!/usr/bin/env bash
# Install Hyperpool keeper + daily-rewards into the current user's crontab (macOS).
# Usage: ./scripts/cron/install-mac-crontab.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARKER_BEGIN="# >>> hyperpool cron begin >>>"
MARKER_END="# <<< hyperpool cron end <<<"

KEEPER="$ROOT/scripts/cron/run-keeper-local.sh"
DAILY="$ROOT/scripts/cron/run-daily-rewards-local.sh"
LOG_KEEPER="/tmp/hyperpool-keeper.log"
LOG_DAILY="/tmp/hyperpool-daily.log"

chmod +x "$KEEPER" "$DAILY" "$ROOT/scripts/cron/install-mac-crontab.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found — install Node.js 20+"
  exit 1
fi

if [[ ! -f "$ROOT/.env.testnet" ]]; then
  echo "ERROR: $ROOT/.env.testnet not found (needs MAIN_PRIVATE_KEY)"
  exit 1
fi

if [[ ! -d "$ROOT/frontend/node_modules/viem" ]]; then
  echo "==> Installing frontend deps (viem for scripts)..."
  (cd "$ROOT/frontend" && npm ci)
fi

BLOCK=$(cat <<EOF
$MARKER_BEGIN
SHELL=/bin/bash
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
# Daily Cashdrop (JST 07:00)
0 7 * * * TZ=Asia/Tokyo $DAILY >> $LOG_DAILY 2>&1
# Keeper rebalance (every 6 hours)
0 */6 * * * $KEEPER >> $LOG_KEEPER 2>&1
$MARKER_END
EOF
)

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$EXISTING" | awk "
  />>> hyperpool cron begin >>>/ { skip=1; next }
  /<<< hyperpool cron end <<</ { skip=0; next }
  skip { next }
  { print }
" | sed '/^$/d')"

{
  [[ -n "$FILTERED" ]] && printf '%s\n' "$FILTERED"
  printf '%s\n' "$BLOCK"
} | crontab -

echo "Installed Hyperpool crontab entries for: $ROOT"
echo ""
crontab -l | awk "/hyperpool cron/,/hyperpool cron end/"
echo ""
echo "Logs: $LOG_KEEPER , $LOG_DAILY"
echo "Manual test:"
echo "  $KEEPER"
echo "  $DAILY"
