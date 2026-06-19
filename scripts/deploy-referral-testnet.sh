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
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/deploy-key-guard.sh"

echo "==> Building contracts..."
forge build

echo "==> Deploying ReferralRegistry to HyperEVM Testnet (998)..."
echo "    RPC: $TESTNET_RPC"

FORGE_ARGS=(--rpc-url "$TESTNET_RPC" --broadcast --slow -vvv)
if [[ -n "${GAS_PRICE:-}" ]]; then
  FORGE_ARGS+=(--gas-price "$GAS_PRICE")
fi

forge script script/DeployReferralRegistry.s.sol:DeployReferralRegistry "${FORGE_ARGS[@]}"

echo "==> Patching 998.json with ReferralRegistry address..."
node "$ROOT/scripts/patch-referral-deployment.mjs" 998 "$TESTNET_RPC"

echo "==> Syncing ABIs + deployment JSON..."
node "$ROOT/scripts/sync-abi.mjs"

echo ""
echo "Done! referralRegistry added to contracts/deployments/998.json"
