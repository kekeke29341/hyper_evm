#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

: "${PRIVATE_KEY:?Set PRIVATE_KEY for deployer}"

# shellcheck disable=SC1091
source "$ROOT/scripts/deploy-key-guard.sh"

echo "Deploying Project X to HyperEVM Mainnet (999)..."
echo "Ensure big blocks enabled: {\"type\":\"evmUserModify\",\"usingBigBlocks\":true}"

forge script script/DeployProjectX.s.sol:DeployProjectX \
  --rpc-url hyperEVM_mainnet \
  --broadcast \
  --slow \
  -vvv

node "$ROOT/scripts/sync-abi.mjs"
echo "Done. Set NEXT_PUBLIC_DEFAULT_CHAIN_ID=999 in frontend/.env.local"
