#!/usr/bin/env bash
# One-shot: create wallet → fund HyperEVM → (optional) deploy Hyperpool to chain 998
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY=false
BOOTSTRAP_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --deploy) DEPLOY=true ;;
    --help|-h)
      echo "Usage: ./scripts/testnet-init.sh [--deploy] [bootstrap flags]"
      echo ""
      echo "  Creates .env.testnet wallet, runs testnet-bootstrap.mjs, optionally deploys."
      echo ""
      echo "Bootstrap flags (passed through):"
      echo "  --skip-drip --skip-buy --skip-bridge --skip-big-blocks"
      echo "  --bridge-amount 0.5"
      exit 0
      ;;
    *) BOOTSTRAP_ARGS+=("$arg") ;;
  esac
done

echo "╔══════════════════════════════════════════════════╗"
echo "║  Hyperpool — HyperEVM Testnet CLI Setup (998)   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# shellcheck disable=SC1091
source "$ROOT/scripts/testnet-env.sh"

if [[ -z "${MAIN_PRIVATE_KEY:-}" && -z "${PRIVATE_KEY:-}" ]]; then
  bash "$ROOT/scripts/testnet-wallet.sh"
  source "$ROOT/scripts/testnet-env.sh"
fi

if [[ -z "${ADDRESS:-}" && -n "${PRIVATE_KEY:-}" ]]; then
  KEY="${PRIVATE_KEY#0x}"
  ADDR_FROM_KEY=$(cd "$ROOT/frontend" && node -e "
const { privateKeyToAccount } = require('viem/accounts');
console.log(privateKeyToAccount('0x${KEY}').address);
" 2>/dev/null || true)
  [[ -n "$ADDR_FROM_KEY" ]] && ADDRESS="$ADDR_FROM_KEY"
fi
echo "    Using wallet: ${ADDRESS:-unknown}"

if [[ ! -d "$ROOT/frontend/node_modules/@nktkas/hyperliquid" ]]; then
  echo "==> Installing frontend deps (Hyperliquid SDK)..."
  npm --prefix "$ROOT/frontend" install --silent
fi

node "$ROOT/scripts/testnet-bootstrap.mjs" "${BOOTSTRAP_ARGS[@]}"

if [[ "$DEPLOY" == "true" ]]; then
  echo ""
  echo "==> Deploying contracts to HyperEVM Testnet..."
  bash "$ROOT/scripts/deploy-testnet.sh"
  echo ""
  echo "==> Post-deploy: liquidity + airdrop..."
  node "$ROOT/scripts/testnet-post-deploy.mjs" || echo "⚠ post-deploy partial — see scripts/testnet-fund-airdrop.mjs"
fi

echo ""
echo "Check status: ./scripts/testnet-check.sh"
