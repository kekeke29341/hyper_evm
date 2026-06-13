#!/usr/bin/env bash
# Run Synpress MetaMask E2E on testnet (998). Requires Synpress cache first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# shellcheck disable=SC1091
source "$ROOT/scripts/testnet-env.sh"

if [[ -z "${SYNPRESS_WALLET_PASSWORD:-}" ]]; then
  echo "ERROR: SYNPRESS_WALLET_PASSWORD is required"
  exit 1
fi

export SYNPRESS_PRIVATE_KEY="${E2E_PRIVATE_KEY:-${SYNPRESS_PRIVATE_KEY:-}}"
if [[ -z "${SYNPRESS_PRIVATE_KEY:-}" ]]; then
  echo "ERROR: E2E_PRIVATE_KEY (or SYNPRESS_PRIVATE_KEY) is required — MAIN_PRIVATE_KEY fallback is not allowed"
  exit 1
fi
if [[ -n "${MAIN_PRIVATE_KEY:-}" && "${SYNPRESS_PRIVATE_KEY}" == "${MAIN_PRIVATE_KEY}" ]]; then
  echo "ERROR: E2E key must not be MAIN_PRIVATE_KEY (deployer)"
  exit 1
fi

export RUN_TESTNET_E2E="${RUN_TESTNET_E2E:-true}"

PORT="${PLAYWRIGHT_PORT:-3000}"
BASE="http://127.0.0.1:${PORT}"

if [[ ! -d "$ROOT/frontend/.cache-synpress" ]]; then
  echo "⚠ Synpress cache missing. Run first:"
  echo "  cd frontend && npm run test:e2e:synpress:cache"
  echo "  (or: npx synpress test/wallet-setup  — headed mode if headless fails)"
  exit 1
fi

cd "$ROOT/frontend"

echo "==> Building frontend for testnet E2E..."
NEXT_PUBLIC_DEFAULT_CHAIN_ID=998 \
NEXT_PUBLIC_TESTNET_RPC="${TESTNET_RPC:-https://rpcs.chain.link/hyperevm/testnet}" \
NEXT_PUBLIC_ADMIN_ENABLED=true \
npm run build

echo "==> Starting server on ${PORT}..."
NEXT_PUBLIC_DEFAULT_CHAIN_ID=998 \
NEXT_PUBLIC_TESTNET_RPC="${TESTNET_RPC:-https://rpcs.chain.link/hyperevm/testnet}" \
NEXT_PUBLIC_ADMIN_ENABLED=true \
npm run start -- -p "$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  if curl -sf "$BASE" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "==> Running Synpress Playwright tests..."
PLAYWRIGHT_BASE_URL="$BASE" \
node --import tsx node_modules/@playwright/test/cli.js test \
  --config=playwright.synpress.config.ts \
  --project=wallet-testnet
