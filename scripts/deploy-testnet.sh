#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "ERROR: Set PRIVATE_KEY (deployer wallet on HyperEVM Testnet 998)"
  echo ""
  echo "  export PRIVATE_KEY=0x..."
  echo "  # Enable big blocks on Hyperliquid first:"
  echo "  # {\"type\":\"evmUserModify\",\"usingBigBlocks\":true}"
  echo "  ./scripts/deploy-testnet.sh"
  exit 1
fi

echo "==> Building contracts..."
forge build

echo "==> Deploying Project X to HyperEVM Testnet (998)..."
echo "    Ensure big blocks: {\"type\":\"evmUserModify\",\"usingBigBlocks\":true}"

forge script script/DeployProjectX.s.sol:DeployProjectX \
  --rpc-url hyperEVM_testnet \
  --broadcast \
  --slow \
  -vvv

echo "==> Syncing ABIs + deployment JSON..."
node "$ROOT/scripts/sync-abi.mjs"

echo ""
echo "Done. Update frontend/.env.local:"
echo "  NEXT_PUBLIC_DEFAULT_CHAIN_ID=998"
echo "  NEXT_PUBLIC_TESTNET_RPC=https://rpc.hyperliquid-testnet.xyz/evm"
echo ""
echo "Optional seed liquidity:"
echo "  SEED_LIQUIDITY=true SEED_KHYPE=1000000000000000000 SEED_USDC=2000000000 ./scripts/deploy-testnet.sh"
