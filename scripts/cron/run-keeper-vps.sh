#!/usr/bin/env bash
# Keeper rebalance — for Linux VPS cron. See docs/本番運用/vps-cron.md
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_vps-common.sh"
cd "$ROOT"

export DEPLOYMENT_CHAIN="${DEPLOYMENT_CHAIN:-998}"
export SKIP_ORACLE="${SKIP_ORACLE:-1}"
HC_URL="${HEALTHCHECK_KEEPER_URL:-}"

run_with_healthcheck "$HC_URL" node "$ROOT/scripts/keeper-rebalance.mjs"
