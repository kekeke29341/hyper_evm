#!/usr/bin/env bash
# Shared helpers for Mac / local cron Cashdrop runners.
set -euo pipefail

configure_mainnet_cashdrop_env() {
  local chain="${DEPLOYMENT_CHAIN:-999}"
  if [[ "$chain" != "999" ]]; then
    return 0
  fi

  export EXTRA_HOLDERS="${EXTRA_HOLDERS:-0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55,0x7638891d1E3962Fa170D6Daa4DB40a7d6079f112}"
  export BALANCE_READ_DELAY_MS="${BALANCE_READ_DELAY_MS:-200}"

  # Dedicated RPC (MAINNET_RPC or RPC_URL) allows larger log chunks.
  if [[ -n "${MAINNET_RPC:-}" ]]; then
    export RPC_URL="${MAINNET_RPC}"
  fi
  if [[ -n "${RPC_URL:-}" ]] && [[ "${RPC_URL}" != "https://rpc.hyperliquid.xyz/evm" ]]; then
    export LOG_CHUNK_SIZE="${LOG_CHUNK_SIZE:-500}"
    export LOG_CHUNK_DELAY_MS="${LOG_CHUNK_DELAY_MS:-300}"
  else
    export LOG_CHUNK_SIZE="${LOG_CHUNK_SIZE:-100}"
    export LOG_CHUNK_DELAY_MS="${LOG_CHUNK_DELAY_MS:-800}"
  fi

  # Known holders live in deployment JSON — skip full-history discovery scan.
  export SKIP_LOG_SCAN="${SKIP_LOG_SCAN:-1}"
}

push_deployment_json_if_changed() {
  local root="$1"
  local chain="$2"
  local deploy_json=(
    "$root/contracts/deployments/${chain}.json"
    "$root/frontend/src/lib/contracts/deployments/${chain}.json"
  )

  if ! git diff --quiet -- "${deploy_json[@]}" 2>/dev/null; then
    git add "${deploy_json[@]}"
    git commit -m "chore(cron): update Cashdrop merkle for chain ${chain}"
    if git push origin HEAD; then
      echo "Pushed deployment JSON — Vercel will redeploy from main."
    else
      echo "ERROR: git push failed — deployment JSON updated locally only." >&2
      if [[ -n "${VERCEL_DEPLOY_HOOK:-}" ]]; then
        curl -fsS -X POST "$VERCEL_DEPLOY_HOOK" >/dev/null \
          && echo "WARN: triggered Vercel deploy hook; JSON on main may still be stale until manual push."
      fi
      echo "WARN: distribute succeeded but git push failed — trigger Vercel manually if UI is stale." >&2
      return 0
    fi
  else
    echo "No deployment JSON changes."
  fi
}

cron_failure_notify() {
  local label="${1:-hyperpool cron}"
  local code="${2:-1}"
  echo "CRON FAILED: ${label} exit ${code} at $(date -Iseconds 2>/dev/null || date)" >&2
  if [[ "$(uname -s)" == "Darwin" ]] && [[ "${CRON_MACOS_NOTIFY:-1}" == "1" ]]; then
    osascript -e "display notification \"${label} failed (exit ${code})\" with title \"Hyperpool cron\"" 2>/dev/null || true
  fi
}
