#!/usr/bin/env bash
# Install Hyperpool keeper + daily-rewards into hyperpool user's crontab (Linux VPS).
# Usage:
#   export HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm
#   export HYPERPOOL_ENV_FILE=/etc/hyperpool/env
#   ./scripts/cron/install-vps-crontab.sh
# See docs/本番運用/vps-cron.md
set -euo pipefail
ROOT="${HYPERPOOL_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${HYPERPOOL_ENV_FILE:-/etc/hyperpool/env}"
LOG_DIR="${HYPERPOOL_LOG_DIR:-/var/log/hyperpool}"
MARKER_BEGIN="# >>> hyperpool vps cron begin >>>"
MARKER_END="# <<< hyperpool vps cron end <<<"

KEEPER="$ROOT/scripts/cron/run-keeper-vps.sh"
DAILY="$ROOT/scripts/cron/run-daily-rewards-vps.sh"
LOG_KEEPER="$LOG_DIR/keeper.log"
LOG_DAILY="$LOG_DIR/daily.log"

chmod +x "$KEEPER" "$DAILY" "$ROOT/scripts/cron/_vps-common.sh" "$ROOT/scripts/cron/install-vps-crontab.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found — install Node.js 20+"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found (needs MAIN_PRIVATE_KEY)"
  exit 1
fi

mkdir -p "$LOG_DIR"

if [[ ! -d "$ROOT/frontend/node_modules/viem" ]]; then
  echo "==> Installing frontend deps (viem for scripts)..."
  (cd "$ROOT/frontend" && npm ci)
fi

BLOCK=$(cat <<EOF
$MARKER_BEGIN
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
HYPERPOOL_ROOT=$ROOT
HYPERPOOL_ENV_FILE=$ENV_FILE
HYPERPOOL_LOG_DIR=$LOG_DIR
# Daily Cashdrop (JST 07:00)
0 7 * * * TZ=Asia/Tokyo $DAILY >> $LOG_DAILY 2>&1
# Keeper rebalance (every 6 hours)
0 */6 * * * $KEEPER >> $LOG_KEEPER 2>&1
$MARKER_END
EOF
)

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$EXISTING" | awk "
  />>> hyperpool vps cron begin >>>/ { skip=1; next }
  /<<< hyperpool vps cron end <<</ { skip=0; next }
  skip { next }
  { print }
" | sed '/^$/d')"

{
  [[ -n "$FILTERED" ]] && printf '%s\n' "$FILTERED"
  printf '%s\n' "$BLOCK"
} | crontab -

echo "Installed Hyperpool VPS crontab entries for: $ROOT"
echo "Env: $ENV_FILE"
echo ""
crontab -l | awk "/hyperpool vps cron/,/hyperpool vps cron end/"
echo ""
echo "Logs: $LOG_KEEPER , $LOG_DAILY"
echo "Manual test:"
echo "  HYPERPOOL_ROOT=$ROOT HYPERPOOL_ENV_FILE=$ENV_FILE $KEEPER"
echo "  HYPERPOOL_ROOT=$ROOT HYPERPOOL_ENV_FILE=$ENV_FILE $DAILY"
