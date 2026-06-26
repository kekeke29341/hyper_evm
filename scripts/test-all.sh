#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Running smart contract tests"
(cd "$ROOT/contracts" && FOUNDRY_PROFILE=ci forge test)

echo "==> Branch coverage gate"
(cd "$ROOT/contracts" && node ../scripts/check-coverage.mjs 17)

echo "==> Ops script unit tests"
node --test "$ROOT/scripts/__tests__/referral-allocation.test.mjs"

echo "==> Ops doc address guard"
node "$ROOT/scripts/verify-doc-addresses.mjs"

echo "==> Running frontend unit tests"
(cd "$ROOT/frontend" && npm run test)

echo "==> Running frontend typecheck"
(cd "$ROOT/frontend" && npm run typecheck)

echo "==> All tests passed"
