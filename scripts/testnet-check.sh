#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${TESTNET_RPC:-https://rpcs.chain.link/hyperevm/testnet}"

if [[ -z "${PRIVATE_KEY:-}" && -f "$ROOT/.env.testnet" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/testnet-env.sh"
fi
DEPLOY_JSON="$ROOT/contracts/deployments/998.json"

echo "==> HyperEVM Testnet (998) status"
echo ""

# RPC
RESP=$(curl -sf --max-time 15 -X POST "$RPC" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' 2>/dev/null || echo "")
if echo "$RESP" | grep -qE '0x3e6|"998"'; then
  echo "✓ RPC reachable ($RPC) — chainId 998"
elif [[ -n "$RESP" ]]; then
  echo "? RPC responded: $RESP"
else
  echo "✗ RPC unreachable (network/SSL?) — try in browser: $RPC"
fi

# Deployment file
if [[ -f "$DEPLOY_JSON" ]]; then
  DEPLOYED=$(node -e "const j=require('$DEPLOY_JSON'); console.log(j.deployed===true && j.router!=='0x0000000000000000000000000000000000000000')")
  if [[ "$DEPLOYED" == "true" ]]; then
    echo "✓ Contracts deployed (998.json)"
    node -e "const j=require('$DEPLOY_JSON'); console.log('  Router:', j.router); console.log('  Pair:', j.pair);"
  else
    echo "○ Contracts NOT deployed yet (placeholder 998.json)"
  fi
else
  echo "○ No deployments/998.json"
fi

# Wallet balance (derive address without passing key as CLI arg)
if [[ -n "${PRIVATE_KEY:-}" ]]; then
  KEY="${PRIVATE_KEY#0x}"
  ADDR=$(cd "$ROOT/frontend" && node -e "
const { privateKeyToAccount } = require('viem/accounts');
console.log(privateKeyToAccount('0x${KEY}').address);
" 2>/dev/null || true)
  if [[ -n "$ADDR" ]]; then
    BAL=$(cast balance "$ADDR" --rpc-url "$RPC" 2>/dev/null || echo "0")
    echo ""
    echo "Deployer: $ADDR"
    echo "HYPE balance (wei): $BAL"
    if [[ "$BAL" == "0" ]]; then
      echo ""
      echo "⚠ No HYPE on HyperEVM. Run: ./scripts/testnet-init.sh"
      echo "  Guide: docs/TESTNET_SETUP.ja.md"
    fi
  fi
else
  echo ""
  echo "○ PRIVATE_KEY not set — skip balance check"
  echo "  export PRIVATE_KEY=0x... && ./scripts/testnet-check.sh"
fi

echo ""
echo "Next: ./scripts/deploy-testnet.sh  (after HYPE + big blocks)"
