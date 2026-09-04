#!/usr/bin/env bash
# Install Hyperpool keeper + daily-rewards into the current user's crontab (macOS).
#
# Default (2026-09+): HYPE-quoted pools only (UETH/UBTC/UPUMP). Legacy HYPE/USDC gen9
# cron (POOL_KEY unset) is intentionally EXCLUDED — re-enabling it would touch the live
# top-level Cashdrop. Set INSTALL_LEGACY_HYPE_USDC_CRON=1 to also install the old block.
#
# Usage: ./scripts/cron/install-mac-crontab.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARKER_BEGIN="# >>> hyperpool cron begin >>>"
MARKER_END="# <<< hyperpool cron end <<<"

KEEPER="$ROOT/scripts/cron/run-keeper-local.sh"
HARVEST="$ROOT/scripts/cron/run-daily-harvest-local.sh"
DISTRIBUTE="$ROOT/scripts/cron/run-daily-distribute-local.sh"
DAILY="$ROOT/scripts/cron/run-daily-rewards-local.sh"
LOG_KEEPER="/tmp/hyperpool-keeper.log"
LOG_DAILY="/tmp/hyperpool-daily.log"

chmod +x "$KEEPER" "$HARVEST" "$DISTRIBUTE" "$DAILY" "$ROOT/scripts/cron/_cron-common.sh" "$ROOT/scripts/cron/install-mac-crontab.sh"

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

LEGACY_BLOCK=""
if [[ "${INSTALL_LEGACY_HYPE_USDC_CRON:-0}" == "1" ]]; then
  LEGACY_BLOCK=$(cat <<EOF
# Legacy HYPE/USDC gen9 (POOL_KEY unset) — only when INSTALL_LEGACY_HYPE_USDC_CRON=1
0 7 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 $HARVEST >> $LOG_DAILY 2>&1
0 9 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 $DISTRIBUTE >> $LOG_DAILY 2>&1
30 9 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 $DISTRIBUTE >> $LOG_DAILY 2>&1
0 */6 * * * DEPLOYMENT_CHAIN=999 $KEEPER >> $LOG_KEEPER 2>&1
EOF
)
fi

BLOCK=$(cat <<EOF
$MARKER_BEGIN
SHELL=/bin/bash
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
$LEGACY_BLOCK
# HYPE-quoted pools (WHYPE Cashdrop, pool TWAP guard). Minutes staggered per pool.
# UPUMP/HYPE
10 7 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=upump-whype $HARVEST >> $LOG_DAILY 2>&1
10 9 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=upump-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
40 9 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=upump-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
15 */6 * * * DEPLOYMENT_CHAIN=999 POOL_KEY=upump-whype SKIP_ORACLE=1 $KEEPER >> $LOG_KEEPER 2>&1
# UBTC/HYPE
20 7 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=ubtc-whype $HARVEST >> $LOG_DAILY 2>&1
20 9 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=ubtc-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
50 9 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=ubtc-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
30 */6 * * * DEPLOYMENT_CHAIN=999 POOL_KEY=ubtc-whype SKIP_ORACLE=1 $KEEPER >> $LOG_KEEPER 2>&1
# UETH/HYPE
30 7 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=ueth-whype $HARVEST >> $LOG_DAILY 2>&1
30 9 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=ueth-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
0 10 * * * TZ=Asia/Tokyo DEPLOYMENT_CHAIN=999 POOL_KEY=ueth-whype $DISTRIBUTE >> $LOG_DAILY 2>&1
45 */6 * * * DEPLOYMENT_CHAIN=999 POOL_KEY=ueth-whype SKIP_ORACLE=1 $KEEPER >> $LOG_KEEPER 2>&1
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
if [[ "${INSTALL_LEGACY_HYPE_USDC_CRON:-0}" == "1" ]]; then
  echo "  (includes legacy HYPE/USDC gen9 cron)"
else
  echo "  HYPE-quoted pools only (ueth/ubtc/upump). Legacy gen9 cron NOT installed."
  echo "  To add legacy: INSTALL_LEGACY_HYPE_USDC_CRON=1 $0"
fi
echo ""
crontab -l | awk "/hyperpool cron/,/hyperpool cron end/"
echo ""
echo "Logs: $LOG_KEEPER , $LOG_DAILY"
echo "Manual test:"
echo "  POOL_KEY=ueth-whype $KEEPER"
echo "  POOL_KEY=ueth-whype $HARVEST"
echo "  POOL_KEY=ueth-whype $DISTRIBUTE"
echo "  POOL_KEY=ueth-whype $DAILY"
