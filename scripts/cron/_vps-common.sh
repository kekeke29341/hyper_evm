#!/usr/bin/env bash
# Shared setup for VPS cron runners. See docs/本番運用/vps-cron.md
set -euo pipefail

ROOT="${HYPERPOOL_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${HYPERPOOL_ENV_FILE:-/etc/hyperpool/env}"
LOG_DIR="${HYPERPOOL_LOG_DIR:-/var/log/hyperpool}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "ERROR: env file not found: $ENV_FILE"
  exit 1
fi

if [[ -n "${MAIN_PRIVATE_KEY:-}" ]]; then
  export MAIN_PRIVATE_KEY
  if [[ "$MAIN_PRIVATE_KEY" == 0x* ]]; then
    export PRIVATE_KEY="$MAIN_PRIVATE_KEY"
  else
    export PRIVATE_KEY="0x$MAIN_PRIVATE_KEY"
  fi
elif [[ -n "${PRIVATE_KEY:-}" && "$PRIVATE_KEY" != 0x* ]]; then
  export PRIVATE_KEY="0x$PRIVATE_KEY"
fi

mkdir -p "$LOG_DIR"

ensure_git_identity() {
  if ! git config user.email >/dev/null 2>&1; then
    git config user.email "${HYPERPOOL_GIT_EMAIL:-hyperpool-cron@hyperpool.local}"
  fi
  if ! git config user.name >/dev/null 2>&1; then
    git config user.name "${HYPERPOOL_GIT_NAME:-Hyperpool VPS Cron}"
  fi
}

ping_healthcheck() {
  local url="${1:-}"
  [[ -z "$url" ]] && return 0
  if curl -fsS -m 10 --retry 3 "$url" >/dev/null; then
    return 0
  fi
  echo "ERROR: healthcheck ping failed: $url" >&2
  return 1
}

fail_healthcheck() {
  local url="${1:-}"
  [[ -z "$url" ]] && return 0
  curl -fsS -m 10 "${url%/}/fail" >/dev/null 2>&1 || true
}

run_with_healthcheck() {
  local url="${1:-}"
  shift
  if [[ -n "$url" ]]; then
    trap 'fail_healthcheck "$url"' ERR
  fi
  "$@"
  local status=$?
  if [[ -n "$url" ]]; then
    trap - ERR
    ping_healthcheck "$url"
  fi
  return "$status"
}
