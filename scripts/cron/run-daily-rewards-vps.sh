#!/usr/bin/env bash
# Daily harvest + Merkle Cashdrop — for Linux VPS cron.
# Updates deployment JSON and pushes to origin when Merkle changes (Vercel redeploy).
# See docs/本番運用/vps-cron.md
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_vps-common.sh"
cd "$ROOT"

export DEPLOYMENT_CHAIN="${DEPLOYMENT_CHAIN:-998}"
CHAIN="$DEPLOYMENT_CHAIN"
HC_URL="${HEALTHCHECK_DAILY_URL:-}"

run_with_healthcheck "$HC_URL" node "$ROOT/scripts/daily-rewards.mjs"

DEPLOY_JSON=(
  "$ROOT/contracts/deployments/${CHAIN}.json"
  "$ROOT/frontend/src/lib/contracts/deployments/${CHAIN}.json"
)

if ! git diff --quiet -- "${DEPLOY_JSON[@]}" 2>/dev/null; then
  ensure_git_identity
  git add "${DEPLOY_JSON[@]}"
  git commit -m "chore(cron): update Cashdrop merkle for chain ${CHAIN}"
  if git push origin HEAD; then
    echo "Pushed deployment JSON — Vercel will redeploy from main."
  else
    echo "ERROR: git push failed — deployment JSON updated locally only." >&2
    if [[ -n "${VERCEL_DEPLOY_HOOK:-}" ]]; then
      curl -fsS -X POST "$VERCEL_DEPLOY_HOOK" >/dev/null \
        && echo "WARN: triggered Vercel deploy hook; JSON on main may still be stale until manual push."
    fi
    exit 1
  fi
else
  echo "No deployment JSON changes (pendingUserRewards may have been 0)."
fi
