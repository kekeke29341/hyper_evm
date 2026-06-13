#!/usr/bin/env bash
# Pre-push checks before GitHub + Vercel. Usage: ./scripts/vercel-prepare.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Git secrets check"
for f in .env.testnet .env .env.local frontend/.env.local; do
  if git check-ignore -q "$f" 2>/dev/null; then
    echo "  ✓ $f ignored"
  elif [[ -f "$f" ]]; then
    echo "  ✗ $f exists but NOT gitignored — fix before push"
    exit 1
  fi
done

if git ls-files --error-unmatch .env.testnet 2>/dev/null; then
  echo "  ✗ .env.testnet is tracked — remove from git"
  exit 1
fi

echo "==> Frontend build (Vercel testnet env)"
cd frontend
NEXT_PUBLIC_DEFAULT_CHAIN_ID=998 \
NEXT_PUBLIC_TESTNET_RPC=https://rpcs.chain.link/hyperevm/testnet \
NEXT_PUBLIC_ADMIN_ENABLED=false \
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=ci-placeholder \
npm run build

echo ""
echo "==> Ready for GitHub + Vercel"
echo "  1. git remote add origin git@github.com:ORG/REPO.git"
echo "  2. git add -A && git commit -m '...' && git push -u origin main"
echo "  3. Vercel → Import → Root Directory: frontend"
echo "  See docs/vercel.md"
