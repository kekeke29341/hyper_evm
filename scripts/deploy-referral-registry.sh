#!/usr/bin/env bash
# Deploy ReferralRegistry to an existing Hyperpool stack (998 / 999 / local).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

CHAIN="${1:-998}"
TESTNET_RPC="${TESTNET_RPC:-https://rpcs.chain.link/hyperevm/testnet}"
MAINNET_RPC="${MAINNET_RPC:-https://rpc.hyperliquid.xyz/evm}"
ANVIL_RPC="${ANVIL_RPC:-http://127.0.0.1:8545}"

case "$CHAIN" in
  998) RPC="$TESTNET_RPC" ;;
  999) RPC="$MAINNET_RPC" ;;
  31337) RPC="$ANVIL_RPC" ;;
  *)
    echo "Usage: $0 [998|999|31337]"
    exit 1
    ;;
esac

if [[ -z "${PRIVATE_KEY:-}" && -f "$ROOT/.env.testnet" && "$CHAIN" == "998" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/testnet-env.sh"
fi

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "ERROR: Set PRIVATE_KEY (or MAIN_PRIVATE_KEY in .env.testnet for chain 998)"
  exit 1
fi

if [[ "$CHAIN" != "31337" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/deploy-key-guard.sh"
fi

echo "==> Deploying ReferralRegistry (chain $CHAIN)"
echo "    RPC: $RPC"

forge build
forge script script/DeployReferral.s.sol:DeployReferral \
  --rpc-url "$RPC" \
  --broadcast \
  --slow \
  -vvv

echo "==> Finalizing deployment JSON..."
node "$ROOT/scripts/finalize-referral.mjs" "$CHAIN" "$RPC"

echo "==> Syncing frontend deployments..."
node "$ROOT/scripts/sync-abi.mjs"

echo ""
echo "Done. referralRegistry added to contracts/deployments/${CHAIN}.json"
