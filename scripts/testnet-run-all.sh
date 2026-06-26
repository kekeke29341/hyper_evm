#!/usr/bin/env bash
# Run all testnet (998) operations that don't require manual bridging.
# Usage: source scripts/testnet-env.sh && ./scripts/testnet-run-all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${PRIVATE_KEY:-}" && -z "${MAIN_PRIVATE_KEY:-}" ]]; then
  echo "Run: source scripts/testnet-env.sh" >&2
  exit 1
fi

echo "========== Testnet E2E (998) =========="
node scripts/testnet-sync-shareholders.mjs
node scripts/verify-testnet.mjs
(cd frontend && npm run verify:testnet)
DEPLOYMENT_CHAIN=998 SKIP_ORACLE=1 node scripts/keeper-rebalance.mjs
FEE_WHYPE=0 FEE_USDC=0.001 node scripts/testnet-accrue-fees.mjs
DEPLOYMENT_CHAIN=998 node scripts/daily-rewards.mjs

POOL="${POOL_USDC:-0.01}"
if POOL_USDC="$POOL" node scripts/testnet-daily-rewards-smoke.mjs; then
  :
else
  echo "⚠ Skipped daily-rewards-smoke (insufficient wallet USDC for POOL_USDC=$POOL)"
fi

node scripts/testnet-wallet-actions.mjs

if [[ -n "${E2E_PRIVATE_KEY:-${SYNPRESS_PRIVATE_KEY:-}}" ]]; then
  node scripts/testnet-e2e-wallet.mjs
else
  echo "⚠ Skipped testnet-e2e-wallet.mjs (set E2E_PRIVATE_KEY in .env.testnet)"
fi

WITHDRAW_BPS="${WITHDRAW_BPS:-500}" REDEPOSIT=1 node scripts/testnet-vault-smoke.mjs
node scripts/testnet-sync-shareholders.mjs
node scripts/verify-testnet.mjs
echo "========== Done =========="
