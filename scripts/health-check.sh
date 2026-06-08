#!/usr/bin/env bash
# Verify local toolchain and optional RPC endpoints.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_RPC="http://127.0.0.1:${ANVIL_PORT}"
TESTNET_RPC="${NEXT_PUBLIC_TESTNET_RPC:-https://rpc.hyperliquid-testnet.xyz/evm}"
MAINNET_RPC="${NEXT_PUBLIC_MAINNET_RPC:-https://rpc.hyperliquid.xyz/evm}"

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  ✓ $name"
    pass=$((pass + 1))
  else
    echo "  ✗ $name"
    fail=$((fail + 1))
  fi
}

rpc_chain_id() {
  local url="$1"
  curl -sf -X POST "$url" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    | grep -q '"result"'
}

echo "==> Toolchain"
check "forge installed" forge --version
check "node installed" node --version
check "npm installed" npm --version

if [[ -d "$ROOT/frontend/node_modules" ]]; then
  check "frontend deps installed" test -d "$ROOT/frontend/node_modules/next"
else
  echo "  ✗ frontend deps (run: cd frontend && npm ci)"
  fail=$((fail + 1))
fi

echo ""
echo "==> RPC endpoints (optional)"
if rpc_chain_id "$ANVIL_RPC"; then
  echo "  ✓ Anvil ($ANVIL_RPC)"
  pass=$((pass + 1))
else
  echo "  – Anvil not running ($ANVIL_RPC) — start with: make dev"
fi

for label_url in "HyperEVM Testnet (998)|$TESTNET_RPC" "HyperEVM Mainnet (999)|$MAINNET_RPC"; do
  label="${label_url%%|*}"
  url="${label_url#*|}"
  if rpc_chain_id "$url"; then
    echo "  ✓ $label"
    pass=$((pass + 1))
  else
    echo "  ⚠ $label unreachable (network/RPC may be down)"
  fi
done

echo ""
echo "==> Contract artifacts"
check "forge build output" test -d "$ROOT/contracts/out"
check "frontend ABIs synced" test -f "$ROOT/frontend/src/lib/contracts/abis/ProjectXRouter.json"

echo ""
if [[ $fail -eq 0 ]]; then
  echo "All checks passed ($pass ok)"
  exit 0
else
  echo "$fail check(s) failed, $pass ok"
  exit 1
fi
