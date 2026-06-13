#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

: "${PRIVATE_KEY:?Set PRIVATE_KEY for deployer}"

# shellcheck disable=SC1091
source "$ROOT/scripts/deploy-key-guard.sh"

echo "Deploying Hyperpool to HyperEVM Mainnet (999)..."
echo "Ensure big blocks enabled: {\"type\":\"evmUserModify\",\"usingBigBlocks\":true}"

FORGE_ARGS=(--rpc-url hyperEVM_mainnet --broadcast --slow -vvv)
if [[ -n "${GAS_PRICE:-}" ]]; then
  FORGE_ARGS+=(--gas-price "$GAS_PRICE")
fi

forge script script/DeployProjectX.s.sol:DeployProjectX "${FORGE_ARGS[@]}"

node "$ROOT/scripts/finalize-deployment.mjs" 999 hyperEVM_mainnet
node "$ROOT/scripts/sync-abi.mjs"
echo "Done. Set NEXT_PUBLIC_DEFAULT_CHAIN_ID=999 in frontend/.env.local"
