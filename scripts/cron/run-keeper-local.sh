#!/usr/bin/env bash
# Keeper rebalance — for local Mac cron. See docs/本番運用/local-mac-cron.md
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/testnet-env.sh"

export DEPLOYMENT_CHAIN="${DEPLOYMENT_CHAIN:-999}"
if [[ "$DEPLOYMENT_CHAIN" == "998" ]]; then
  export SKIP_ORACLE="${SKIP_ORACLE:-1}"
else
  export SKIP_ORACLE="${SKIP_ORACLE:-0}"
fi

exec node "$ROOT/scripts/keeper-rebalance.mjs"
