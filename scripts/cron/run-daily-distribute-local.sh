#!/usr/bin/env bash
# Distribute phase only — JST 08:00 cron. Pushes deployment JSON on success.
# See docs/本番運用/local-mac-cron.md
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/testnet-env.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/cron/_cron-common.sh"

export DEPLOYMENT_CHAIN="${DEPLOYMENT_CHAIN:-999}"
CHAIN="$DEPLOYMENT_CHAIN"
configure_mainnet_cashdrop_env

trap 'status=$?; [[ $status -ne 0 ]] && cron_failure_notify "daily-distribute" "$status"; exit $status' EXIT

export DAILY_REWARDS_PHASE=distribute
node "$ROOT/scripts/daily-rewards.mjs"

push_deployment_json_if_changed "$ROOT" "$CHAIN"
