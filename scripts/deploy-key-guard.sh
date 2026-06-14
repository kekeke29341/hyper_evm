#!/usr/bin/env bash
# Validate deployer private key before mainnet/testnet deploy.
set -euo pipefail

: "${PRIVATE_KEY:?Set PRIVATE_KEY for deployer}"

KEY="${PRIVATE_KEY#0x}"
KEY_FULL="0x${KEY}"

# Standard Anvil / Hardhat dev private keys (64 hex chars each).
KNOWN_DEV_KEYS=(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  "0x59c6995e998f8c4426adca40caed0b295bbf95e1c7f3b7957a1508d9f4a672e8"
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca40fc895011acf942fa7a3"
  "0x7c852118292e3269dde12bb38878cc96a2da3a458545644475a58dd77fa6cd755"
  "0x47e179ec197488593b187f80d00eb0da91f592b0ac95e967127804e3b6ac627c"
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e3c038bebb3cb"
  "0x92db14e403b83dfe3df233f83dfa3b0d6bab2c82df9a917d60b11de2858a47c0"
  "0x4bbbf85ce3377467afea5fe5820d2ad436d528dd228fe7f189c69c0d6cb3bb0e"
  "0xdbda3561b48d0c3c01549c4c6d0bcfd789ba88c2a519e171c447afea3b37509"
  "0x2a871d0798f97d63448f91d403dc45d019c093d759d50ca40629c2d67f6c5c35"
)

# Derived addresses for the same well-known dev accounts (more reliable than key string match).
KNOWN_DEV_ADDRS=(
  "0xf39Fd6e51aad88f6F4ce6aB8827279cffFb92266"
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
  "0x9965507D1a55bc2694C58ae12faD9C3C0CFA3A0"
  "0x976EA74026E726554dB657FA54799abd0C3a0d65"
  "0x14dC79964da2C08b23698B00335BC7f9b3444E80"
  "0x23618e81E3f5cdF7f54a3b466964d1aE3Fe9685"
  "0xa0Ee7A142d267C1b3671E543aE112Bc6188E46AC"
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

for known_addr in "${KNOWN_DEV_ADDRS[@]}"; do
  if [[ "${ADDR,,}" == "${known_addr,,}" ]]; then
    echo "ERROR: Refusing to deploy from a known Anvil/Hardhat dev account (${ADDR})."
    echo "       Use a dedicated deployer key and export DEPLOYER_ADDRESS to confirm."
    exit 1
  fi
done

if [[ -n "${DEPLOYER_ADDRESS:-}" ]]; then
  if [[ "${DEPLOYER_ADDRESS,,}" != "${ADDR,,}" ]]; then
    echo "ERROR: DEPLOYER_ADDRESS (${DEPLOYER_ADDRESS}) does not match derived address (${ADDR})"
    exit 1
  fi
  echo "✓ DEPLOYER_ADDRESS matches"
fi
