#!/usr/bin/env bash
# Daily harvest + Merkle Cashdrop — for local Mac cron.
# Updates deployment JSON and pushes to origin when Merkle changes (Vercel redeploy).
# See docs/本番運用/local-mac-cron.md
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/testnet-env.sh"

export DEPLOYMENT_CHAIN="${DEPLOYMENT_CHAIN:-998}"
CHAIN="$DEPLOYMENT_CHAIN"

node "$ROOT/scripts/daily-rewards.mjs"

DEPLOY_JSON=(
  "$ROOT/contracts/deployments/${CHAIN}.json"
  "$ROOT/frontend/src/lib/contracts/deployments/${CHAIN}.json"
)

if ! git diff --quiet -- "${DEPLOY_JSON[@]}" 2>/dev/null; then
  git add "${DEPLOY_JSON[@]}"
  git commit -m "chore(cron): update Cashdrop merkle for chain ${CHAIN}"
  git push origin HEAD
  echo "Pushed deployment JSON — Vercel will redeploy from main."
else
  echo "No deployment JSON changes (pendingUserRewards may have been 0)."
fi
