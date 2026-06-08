.PHONY: dev test build health sync-abi ci-local deploy-testnet

ROOT := $(shell pwd)

dev:
	./scripts/dev-local.sh

test:
	./scripts/test-all.sh

build:
	cd contracts && forge build
	cd frontend && npm run build

health:
	./scripts/health-check.sh

sync-abi:
	node scripts/sync-abi.mjs

ci-local: test
	cd frontend && npm run lint && npm run build

deploy-testnet:
	./scripts/deploy-testnet.sh

deploy-mainnet:
	./scripts/deploy-mainnet.sh
