#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANVIL_CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_RPC="http://127.0.0.1:${ANVIL_PORT}"
STATE_FILE="$ROOT/contracts/anvil-state.json"
PID_FILE="$ROOT/contracts/.anvil.pid"

cleanup() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "==> Stopping Anvil (pid $pid)..."
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}
trap cleanup EXIT INT TERM

echo "==> Building contracts..."
cd "$ROOT/contracts" && forge build

echo "==> Starting Anvil (chain ${ANVIL_CHAIN_ID}) if not running..."
if ! curl -sf -X POST "$ANVIL_RPC" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' >/dev/null 2>&1; then
  ANVIL_ARGS=(--chain-id "$ANVIL_CHAIN_ID" --port "$ANVIL_PORT")
  if [[ -f "$STATE_FILE" ]]; then
    ANVIL_ARGS+=(--state "$STATE_FILE")
    echo "    Loading saved state from anvil-state.json"
  elif [[ -n "${FORK_URL:-}" ]]; then
    ANVIL_ARGS+=(--fork-url "$FORK_URL")
    echo "    Forking: $FORK_URL"
  fi
  anvil "${ANVIL_ARGS[@]}" &
  echo $! > "$PID_FILE"
  sleep 2
fi

export PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

ROUTER="0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"
LOADED_STATE=false

if curl -sf -X POST "$ANVIL_RPC" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"${ROUTER}\",\"latest\"],\"id\":1}" \
  | grep -qv '"result":"0x"'; then
  echo "==> Anvil already has deployment — skipping deploy"
  LOADED_STATE=true
fi

if [[ "$LOADED_STATE" == "false" ]]; then
  echo "==> Deploying to Anvil..."
  forge script script/DeployLocal.s.sol:DeployLocal \
    --rpc-url "$ANVIL_RPC" --broadcast --slow

  echo "==> Syncing ABIs..."
  node "$ROOT/scripts/sync-abi.mjs"

  echo "==> Setting up local airdrop..."
  node "$ROOT/scripts/setup-local-airdrop.mjs" || echo "Warning: airdrop setup skipped"

  echo "==> Saving Anvil state..."
  node "$ROOT/scripts/save-anvil-state.mjs" || echo "Warning: state save skipped"
else
  echo "==> Syncing ABIs (deployments)..."
  node "$ROOT/scripts/sync-abi.mjs"
fi

echo ""
echo "==> Local stack ready"
echo "    RPC:      $ANVIL_RPC"
echo "    Chain ID: $ANVIL_CHAIN_ID"
echo "    Symbol:   HYPE"
echo "    Fork:     FORK_URL=https://rpc.hyperliquid-testnet.xyz/evm ANVIL_CHAIN_ID=998 ./scripts/dev-local.sh"
echo ""
echo "==> Starting frontend..."
cd "$ROOT/frontend" && npm run dev
