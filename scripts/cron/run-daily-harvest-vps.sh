#!/usr/bin/env bash
# Harvest phase only — VPS cron (JST 07:00). See docs/本番運用/vps-cron.md
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_vps-common.sh"
cd "$ROOT"

export DEPLOYMENT_CHAIN="${DEPLOYMENT_CHAIN:-999}"
HC_URL="${HEALTHCHECK_DAILY_URL:-}"

export DAILY_REWARDS_PHASE=harvest
run_with_healthcheck "$HC_URL" node "$ROOT/scripts/daily-rewards.mjs"
