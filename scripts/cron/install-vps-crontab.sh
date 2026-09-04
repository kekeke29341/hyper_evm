#!/usr/bin/env bash
# Install Hyperpool keeper + daily-rewards into hyperpool user's crontab (Linux VPS).
#
# Default (2026-09+): HYPE-quoted pools only. Legacy HYPE/USDC gen9 cron is excluded unless
# INSTALL_LEGACY_HYPE_USDC_CRON=1. VPS wrappers (run-*-vps.sh) must pass POOL_KEY through — see
# docs/本番運用/vps-cron.md.
#
# Usage:
#   export HYPERPOOL_ROOT=/opt/hyperpool/hyper_evm
#   export HYPERPOOL_ENV_FILE=/etc/hyperpool/env
#   ./scripts/cron/install-vps-crontab.sh
set -euo pipefail
ROOT="${HYPERPOOL_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${HYPERPOOL_ENV_FILE:-/etc/hyperpool/env}"
LOG_DIR="${HYPERPOOL_LOG_DIR:-/var/log/hyperpool}"
MARKER_BEGIN="# >>> hyperpool vps cron begin >>>"
MARKER_END="# <<< hyperpool vps cron end <<<"

KEEPER="$ROOT/scripts/cron/run-keeper-vps.sh"
HARVEST="$ROOT/scripts/cron/run-daily-harvest-vps.sh"
DISTRIBUTE="$ROOT/scripts/cron/run-daily-distribute-vps.sh"
DAILY="$ROOT/scripts/cron/run-daily-rewards-vps.sh"
LOG_KEEPER="$LOG_DIR/keeper.log"
LOG_DAILY="$LOG_DIR/daily.log"

chmod +x "$KEEPER" "$HARVEST" "$DISTRIBUTE" "$DAILY" "$ROOT/scripts/cron/_vps-common.sh" "$ROOT/scripts/cron/install-vps-crontab.sh"

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

LEGACY_BLOCK=""
if [[ "${INSTALL_LEGACY_HYPE_USDC_CRON:-0}" == "1" ]]; then
  LEGACY_BLOCK=$(cat <<EOF
# Legacy HYPE/USDC gen9 (POOL_KEY unset)
0 7 * * * TZ=Asia/Tokyo $HARVEST >> $LOG_DAILY 2>&1
0 9 * * * TZ=Asia/Tokyo $DISTRIBUTE >> $LOG_DAILY 2>&1
30 9 * * * TZ=Asia/Tokyo $DISTRIBUTE >> $LOG_DAILY 2>&1
0 */6 * * * $KEEPER >> $LOG_KEEPER 2>&1
EOF
)
fi

BLOCK=$(cat <<EOF
$MARKER_BEGIN
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
HYPERPOOL_ROOT=$ROOT
HYPERPOOL_ENV_FILE=$ENV_FILE
HYPERPOOL_LOG_DIR=$LOG_DIR
$LEGACY_BLOCK
# HYPE-quoted pools (staggered JST). POOL_KEY is forwarded by the vps wrapper scripts.
10 7 * * * TZ=Asia/Tokyo POOL_KEY=upump-whype $HARVEST >> $LOG_DAILY 2>&1
10 9 * * * TZ=Asia/Tokyo POOL_KEY=upump-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
40 9 * * * TZ=Asia/Tokyo POOL_KEY=upump-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
15 */6 * * * POOL_KEY=upump-whype SKIP_ORACLE=1 $KEEPER >> $LOG_KEEPER 2>&1
20 7 * * * TZ=Asia/Tokyo POOL_KEY=ubtc-whype $HARVEST >> $LOG_DAILY 2>&1
20 9 * * * TZ=Asia/Tokyo POOL_KEY=ubtc-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
50 9 * * * TZ=Asia/Tokyo POOL_KEY=ubtc-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
30 */6 * * * POOL_KEY=ubtc-whype SKIP_ORACLE=1 $KEEPER >> $LOG_KEEPER 2>&1
30 7 * * * TZ=Asia/Tokyo POOL_KEY=ueth-whype $HARVEST >> $LOG_DAILY 2>&1
30 9 * * * TZ=Asia/Tokyo POOL_KEY=ueth-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
0 10 * * * TZ=Asia/Tokyo POOL_KEY=ueth-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
45 */6 * * * POOL_KEY=ueth-whype SKIP_ORACLE=1 $KEEPER >> $LOG_KEEPER 2>&1
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
if [[ "${INSTALL_LEGACY_HYPE_USDC_CRON:-0}" == "1" ]]; then
  echo "  (includes legacy HYPE/USDC gen9 cron)"
else
  echo "  HYPE-quoted pools only. Legacy gen9 cron NOT installed."
fi
echo "Env: $ENV_FILE"
echo ""
crontab -l | awk "/hyperpool vps cron/,/hyperpool vps cron end/"
echo ""
echo "Logs: $LOG_KEEPER , $LOG_DAILY"
