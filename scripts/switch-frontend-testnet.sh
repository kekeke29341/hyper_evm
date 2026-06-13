#!/usr/bin/env bash
# Switch frontend/.env.local to HyperEVM Testnet (998)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$ROOT/frontend/.env.local"

if [[ ! -f "$ENV" ]]; then
  cp "$ROOT/frontend/.env.local.example" "$ENV"
fi

if grep -q '^NEXT_PUBLIC_DEFAULT_CHAIN_ID=' "$ENV"; then
  sed -i.bak 's/^NEXT_PUBLIC_DEFAULT_CHAIN_ID=.*/NEXT_PUBLIC_DEFAULT_CHAIN_ID=998/' "$ENV"
else
  echo "NEXT_PUBLIC_DEFAULT_CHAIN_ID=998" >> "$ENV"
fi

rm -f "$ENV.bak"
echo "Updated $ENV → NEXT_PUBLIC_DEFAULT_CHAIN_ID=998"
echo "Restart: cd frontend && npm run dev"
