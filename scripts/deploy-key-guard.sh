#!/usr/bin/env bash
# Validate deployer private key before mainnet/testnet deploy.
set -euo pipefail

: "${PRIVATE_KEY:?Set PRIVATE_KEY for deployer}"

KEY="${PRIVATE_KEY#0x}"
KEY_FULL="0x${KEY}"

KNOWN_DEV_KEYS=(
  "0xac0974bec39a17e36ba4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  "0x59c6995e998f8c4426adca40caed0b295bbf95e1"
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca40fc895011acf942fa7a3"
  "0x7c852118292e3269dde12bb38878cc96a2da3a458545644475a58dd77fa6cd755"
  "0x47e179ec197488593b187f80d00eb0da91f592b0ac95e967127804e3b6ac627c"
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e3c038bebb3cb"
  "0x92db14e403b83dfe3df233f83dfa3b0d6bab2c82df9a917d60b11de2858a47c0"
  "0x4bbbf85ce3377467afea5fe5820d2ad436d528dd228fe7f189c69c0d6cb3bb0e"
  "0xdbda3561b48d0c3c01549c4c6d0bcfd789ba88c2a519e171c447afea3b37509"
  "0x2a871d0798f97d63448f91d403dc45d019c093d759d50ca40629c2d67f6c5c35"
)

for known in "${KNOWN_DEV_KEYS[@]}"; do
  if [[ "${KEY_FULL,,}" == "${known,,}" ]]; then
    echo "ERROR: Refusing to deploy with a known Anvil/Hardhat dev private key."
    echo "       Use a dedicated deployer key and export DEPLOYER_ADDRESS to confirm."
    exit 1
  fi
done

GUARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$GUARD_DIR/.." && pwd)"
ADDR=$(cd "$ROOT/frontend" && node -e "
const { privateKeyToAccount } = require('viem/accounts');
console.log(privateKeyToAccount('${KEY_FULL}').address);
")

echo "Deployer address: $ADDR"

if [[ -n "${DEPLOYER_ADDRESS:-}" ]]; then
  if [[ "${DEPLOYER_ADDRESS,,}" != "${ADDR,,}" ]]; then
    echo "ERROR: DEPLOYER_ADDRESS (${DEPLOYER_ADDRESS}) does not match derived address (${ADDR})"
    exit 1
  fi
  echo "✓ DEPLOYER_ADDRESS matches"
fi
