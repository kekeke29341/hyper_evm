#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

TESTNET_RPC="${TESTNET_RPC:-https://rpcs.chain.link/hyperevm/testnet}"

if [[ -z "${PRIVATE_KEY:-}" && -f "$ROOT/.env.testnet" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/testnet-env.sh"
fi

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "ERROR: Set MAIN_PRIVATE_KEY in .env.testnet (or export PRIVATE_KEY)"
  echo ""
  echo "  ./scripts/testnet-init.sh --deploy"
  echo "  # or: export PRIVATE_KEY=0x... && ./scripts/deploy-testnet.sh"
  echo "  # Guide: docs/TESTNET_SETUP.ja.md"
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/deploy-key-guard.sh"

echo "==> Building contracts..."
forge build

echo "==> Deploying Hyperpool to HyperEVM Testnet (998)..."
echo "    RPC: $TESTNET_RPC"
echo "    Ensure big blocks: {\"type\":\"evmUserModify\",\"usingBigBlocks\":true}"

forge script script/DeployProjectX.s.sol:DeployProjectX \
  --rpc-url "$TESTNET_RPC" \
  --broadcast \
  --slow \
  -vvv

echo "==> Finalizing deployment JSON after on-chain code verification..."
node "$ROOT/scripts/finalize-deployment.mjs" 998 "$TESTNET_RPC"

echo "==> Syncing ABIs + deployment JSON..."
node "$ROOT/scripts/sync-abi.mjs"

echo "==> Switching frontend to testnet (998)..."
bash "$ROOT/scripts/switch-frontend-testnet.sh"

echo ""
echo "Done! Contract addresses in contracts/deployments/998.json"
echo ""
echo "Start frontend:"
echo "  cd frontend && npm run dev"
echo ""
echo "MetaMask: Chain 998, RPC https://rpc.hyperliquid-testnet.xyz/evm"
echo "Full guide: docs/TESTNET_SETUP.ja.md"
echo ""
echo "Optional seed liquidity (re-run with env vars):"
echo "  SEED_LIQUIDITY=true SEED_KHYPE=1000000000000000000 SEED_USDC=2000000000 ./scripts/deploy-testnet.sh"
