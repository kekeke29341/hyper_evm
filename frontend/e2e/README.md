# E2E Testing — Project X

## 1. Smoke tests (UI only, no MetaMask)

```bash
cd frontend
CI=true npm run test:e2e          # 7 tests — tabs, admin, deploy banner
```

## 2. Wallet mock (injected provider, headless CI)

Uses `@depay/web3-mock` — verifies provider injection + wallet modal (no real txs).

```bash
cd frontend
npm run test:e2e:wallet:mock      # 3 tests
```

## 3. On-chain RPC verify (no browser)

Confirms contracts, LP, router quotes, cashdrop state on HyperEVM 998.

```bash
source scripts/testnet-env.sh
cd frontend && npm run verify:testnet
```

## 4. Synpress + MetaMask (real on-chain testnet)

### One-time cache build (needs GUI — headless often fails)

```bash
source scripts/testnet-env.sh
cd frontend
npm run test:e2e:synpress:cache
# If headless fails:
#   cd frontend && npx synpress test/wallet-setup
```

### Run wallet tests on HyperEVM 998

```bash
source scripts/testnet-env.sh
export SYNPRESS_PRIVATE_KEY="$MAIN_PRIVATE_KEY"
export RUN_TESTNET_E2E=true
cd frontend && npm run test:e2e:wallet:testnet
```

Tests: connect → Cashdrop claim (or already-claimed) → small Swap.

### Local Anvil (optional)

```bash
# Terminal 1
./scripts/dev-local.sh

# Terminal 2
cd frontend && npm run test:e2e:synpress:cache
RUN_LOCAL_E2E=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e:wallet:local
```

## 5. Manual checklist (MetaMask GUI)

Use wallet `MAIN_ADDRESS` on chain **998**, RPC `https://rpcs.chain.link/hyperevm/testnet`.

- [ ] Connect MetaMask + WalletConnect
- [ ] Swap WHYPE ↔ USDC (small amount)
- [ ] Add / remove liquidity
- [ ] Portfolio shows LP balance
- [ ] Cashdrop claim (if eligible)
- [ ] Points tab after swap
- [ ] Affiliate referral code
- [ ] `/admin` with deployer wallet

## 6. Run everything (automated)

```bash
cd frontend
CI=true npm run test:e2e
npm run test:e2e:wallet:mock
source ../scripts/testnet-env.sh && npm run verify:testnet
# After Synpress cache:
RUN_TESTNET_E2E=true npm run test:e2e:wallet:testnet
```
