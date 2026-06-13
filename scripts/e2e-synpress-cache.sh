#!/usr/bin/env bash
# Build Synpress MetaMask cache for E2E wallet tests.
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

cd "$ROOT/frontend"
echo "==> Building Synpress cache (MetaMask extension — may need headed mode locally)..."
echo "    Tip: if headless fails, run: cd frontend && npx synpress test/wallet-setup"
HEADLESS="${HEADLESS:-true}" npx synpress test/wallet-setup -f || {
  echo ""
  echo "⚠ Synpress cache build failed in headless mode."
  echo "  Run manually on your machine (GUI):"
  echo "    cd frontend && npx synpress test/wallet-setup"
  exit 0
}

echo "Done. Run: cd frontend && RUN_TESTNET_E2E=true npm run test:e2e:wallet"
