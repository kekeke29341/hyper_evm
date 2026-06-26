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

ANVIL_SETUP="test/wallet-setup/anvil-local.setup.ts"
ANVIL_SKIP=""
if [[ "${RUN_ANVIL_SYNPRESS_CACHE:-false}" != "true" && -f "$ANVIL_SETUP" ]]; then
  ANVIL_SKIP="${ANVIL_SETUP}.skip"
  mv "$ANVIL_SETUP" "$ANVIL_SKIP"
  restore_anvil() { [[ -f "$ANVIL_SKIP" ]] && mv "$ANVIL_SKIP" "$ANVIL_SETUP"; }
  trap restore_anvil EXIT
fi

echo "    Tip: if headless fails, run: cd frontend && HEADLESS=false npx synpress test/wallet-setup"
HEADLESS="${HEADLESS:-true}" npx synpress test/wallet-setup -f -d || {
  echo ""
  echo "⚠ Synpress cache build failed in headless mode."
  echo "  Run manually on your machine (GUI):"
  echo "    cd frontend && HEADLESS=false npx synpress test/wallet-setup"
  exit 0
}

# Persist hash from newest cache dir (synpress names dirs by setup hash).
HASH=""
NEWEST=""
while IFS= read -r dir; do
  base=$(basename "$dir")
  if [[ "$base" =~ ^[0-9a-f]{20}$ ]] && [[ -d "$dir/Default" ]]; then
    NEWEST="$base"
  fi
done < <(find .cache-synpress -maxdepth 1 -type d -name '[0-9a-f][0-9a-f]*' -print0 2>/dev/null | xargs -0 ls -dt 2>/dev/null || true)
HASH="$NEWEST"
if [[ -n "$HASH" ]]; then
  echo "$HASH" > .cache-synpress/.wallet-setup-hash
  echo "Wrote cache hash: $HASH"
fi

echo "Done. Run: cd frontend && RUN_TESTNET_E2E=true npm run test:e2e:wallet:testnet"
