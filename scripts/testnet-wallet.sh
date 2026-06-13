#!/usr/bin/env bash
# Create or reuse a HyperEVM testnet deployer wallet (stored in .env.testnet).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.testnet"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  if [[ -n "${MAIN_PRIVATE_KEY:-}" || -n "${MAIN_ADDRESS:-}" ]]; then
    echo "==> Using MAIN wallet from .env.testnet"
    echo "    Address: ${MAIN_ADDRESS:-unknown}"
    exit 0
  fi
  if [[ -n "${PRIVATE_KEY:-}" && -n "${ADDRESS:-}" ]]; then
    echo "==> Reusing wallet from .env.testnet"
    echo "    Address: $ADDRESS"
    exit 0
  fi
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "ERROR: foundry (cast) required. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  exit 1
fi

echo "==> Creating new testnet wallet (cast wallet new)..."
OUT="$(cast wallet new 2>&1)"

ADDR="$(echo "$OUT" | awk '/^Address:/ {print $2}')"
KEY="$(echo "$OUT" | awk '/^Private key:/ {print $3}')"

if [[ -z "$ADDR" || -z "$KEY" ]]; then
  echo "ERROR: failed to parse cast wallet new output:"
  echo "$OUT"
  exit 1
fi

cat > "$ENV_FILE" <<EOF
# HyperEVM testnet deployer — DO NOT COMMIT
PRIVATE_KEY=$KEY
ADDRESS=$ADDR
EOF
chmod 600 "$ENV_FILE"

echo "==> Saved to .env.testnet (gitignored)"
echo "    Address:     $ADDR"
echo "    Private key: (in .env.testnet)"
echo ""
echo "Next: ./scripts/testnet-init.sh"
