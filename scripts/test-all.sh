#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Running smart contract tests"
(cd "$ROOT/contracts" && FOUNDRY_PROFILE=ci forge test)

echo "==> Running frontend unit tests"
(cd "$ROOT/frontend" && npm run test)

echo "==> Running frontend typecheck"
(cd "$ROOT/frontend" && npm run typecheck)

echo "==> All tests passed"
