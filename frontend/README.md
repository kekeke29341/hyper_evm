# Hyperpool Frontend

Next.js App Router UI for the HyperEVM DEX.

## Development

```bash
# From repo root (recommended — starts Anvil + deploy + dev server)
./scripts/dev-local.sh

# Frontend only (requires running Anvil + deployed contracts)
cp .env.local.example .env.local
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (port 3000) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E smoke tests |
| `npm run sync-abi` | Sync ABIs from `contracts/out/` |

See [../docs/development.md](../docs/development.md) and [../README.md](../README.md) for full infrastructure and deployment docs.
