#!/usr/bin/env bash
# Load .env.testnet — prefers MAIN_PRIVATE_KEY / MAIN_ADDRESS when set.
# Usage: source "$(dirname "$0")/testnet-env.sh"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.testnet"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -n "${MAIN_PRIVATE_KEY:-}" ]]; then
  export MAIN_PRIVATE_KEY
  export MAIN_ADDRESS="${MAIN_ADDRESS:-}"
  if [[ "$MAIN_PRIVATE_KEY" == 0x* ]]; then
    export PRIVATE_KEY="$MAIN_PRIVATE_KEY"
  else
    export PRIVATE_KEY="0x$MAIN_PRIVATE_KEY"
  fi
  export ADDRESS="${MAIN_ADDRESS:-}"
elif [[ -n "${PRIVATE_KEY:-}" && "${PRIVATE_KEY}" != 0x* ]]; then
  export PRIVATE_KEY="0x$PRIVATE_KEY"
fi
