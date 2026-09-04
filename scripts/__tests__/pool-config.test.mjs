import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePool,
  priceDivFor,
  quoteFromBase,
  upsertPoolPreservingTopLevel,
  resolveRewardScope,
  mergeScopeOntoDisk,
} from "../lib/pool-config.mjs";

const DEPLOYMENT = {
  hyperpoolVault: "0xVaultLegacy",
  projectXAdapter: "0xAdapterLegacy",
  oracle: "0xOracle",
  tokenKHYPE: "0x5555555555555555555555555555555555555555",
  tokenUSDC: "0xUSDC",
  pools: [
    {
      key: "upump-whype",
      vault: "0xVaultUpump",
      adapter: "0xAdapterUpump",
      oracle: "0x0000000000000000000000000000000000000000",
      baseToken: "0xUPUMP",
      quoteToken: "0x5555555555555555555555555555555555555555",
      baseDecimals: 6,
      quoteDecimals: 18,
    },
    {
      key: "ubtc-whype",
      vault: "0xVaultUbtc",
      adapter: "0xAdapterUbtc",
      baseToken: "0xUBTC",
      quoteToken: "0x5555555555555555555555555555555555555555",
      baseDecimals: 8,
      quoteDecimals: 18,
    },
  ],
};

test("priceDivFor matches the four supported profiles", () => {
  assert.equal(priceDivFor(18, 6), 10n ** 30n, "USDC/WHYPE legacy → 1e30");
  assert.equal(priceDivFor(6, 18), 10n ** 6n, "UPUMP → 1e6");
  assert.equal(priceDivFor(8, 18), 10n ** 8n, "UBTC → 1e8");
  assert.equal(priceDivFor(18, 18), 10n ** 18n, "UETH → 1e18");
});

test("legacy path uses hardcoded 6/18 constants and never touches pools[]", () => {
  const cfg = resolvePool(DEPLOYMENT, undefined);
  assert.equal(cfg.hypeQuoted, false);
  assert.equal(cfg.vault, "0xVaultLegacy");
  assert.equal(cfg.adapter, "0xAdapterLegacy");
  assert.equal(cfg.oracle, "0xOracle");
  assert.equal(cfg.quoteDecimals, 6);
  assert.equal(cfg.baseDecimals, 18);
  assert.equal(cfg.priceDiv, 10n ** 30n);
  assert.equal(cfg.humanDivisor, 10n ** 6n);
});

test("POOL_KEY resolves a pools[] entry with derived priceDiv", () => {
  const cfg = resolvePool(DEPLOYMENT, "upump-whype");
  assert.equal(cfg.hypeQuoted, true);
  assert.equal(cfg.vault, "0xVaultUpump");
  assert.equal(cfg.baseDecimals, 6);
  assert.equal(cfg.quoteDecimals, 18);
  assert.equal(cfg.priceDiv, 10n ** 6n);
  assert.equal(cfg.humanDivisor, 10n ** 18n);
  assert.equal(cfg.oracle, null, "zero-address oracle normalizes to null");
});

test("unknown POOL_KEY throws", () => {
  assert.throws(() => resolvePool(DEPLOYMENT, "nope"), /not found/);
});

test("quoteFromBase reduces to legacy /1e30 for USDC/WHYPE", () => {
  // 3 WHYPE (base, 18-dec) at 42 USDC/HYPE → 126 USDC (6-dec).
  const price = 42n * 10n ** 6n * 10n ** 12n; // quote-per-base * 1e18
  const out = quoteFromBase(3n * 10n ** 18n, price, priceDivFor(18, 6));
  assert.equal(out, 126n * 10n ** 6n);
});

test("quoteFromBase for UBTC (8-dec base) yields WHYPE quote", () => {
  // 2 UBTC at 65000 HYPE each → 130000 WHYPE (18-dec).
  const price = 65_000n * 10n ** 18n; // quote-per-base * 1e18
  const out = quoteFromBase(2n * 10n ** 8n, price, priceDivFor(8, 18));
  assert.equal(out, 130_000n * 10n ** 18n);
});

// --- upsertPoolPreservingTopLevel (finalize --pair core) ---------------------

const LIVE_TOPLEVEL = {
  chainId: 999,
  deployed: true,
  hyperpoolVault: "0xLiveVault",
  projectXAdapter: "0xLiveAdapter",
  tokenUSDC: "0xUSDC",
  cashdropDistributionHistory: [{ at: "2026-08-01" }],
};

const NEW_ENTRY = {
  key: "ueth-whype",
  label: "UETH/HYPE",
  vault: "0xVaultUeth",
  adapter: "0xAdapterUeth",
  airdrop: "0xAirdropUeth",
  baseDecimals: 18,
  quoteDecimals: 18,
  cashdrop: {},
};

test("upsert inserts a new pool and leaves every top-level field untouched", () => {
  const out = upsertPoolPreservingTopLevel(LIVE_TOPLEVEL, NEW_ENTRY);
  assert.equal(out.pools.length, 1);
  assert.equal(out.pools[0].key, "ueth-whype");
  // Top-level identical.
  assert.equal(out.hyperpoolVault, "0xLiveVault");
  assert.equal(out.projectXAdapter, "0xLiveAdapter");
  assert.deepEqual(out.cashdropDistributionHistory, [{ at: "2026-08-01" }]);
  // Input not mutated.
  assert.equal(LIVE_TOPLEVEL.pools, undefined);
});

test("upsert updates an existing pool but preserves its accumulated cashdrop", () => {
  const withPool = {
    ...LIVE_TOPLEVEL,
    pools: [
      {
        ...NEW_ENTRY,
        vault: "0xOldVault",
        cashdrop: { cashdropDistributionHistory: [{ at: "2026-08-10" }] },
      },
    ],
  };
  const out = upsertPoolPreservingTopLevel(withPool, NEW_ENTRY);
  assert.equal(out.pools.length, 1);
  assert.equal(out.pools[0].vault, "0xVaultUeth", "addresses refreshed");
  assert.deepEqual(
    out.pools[0].cashdrop,
    { cashdropDistributionHistory: [{ at: "2026-08-10" }] },
    "cashdrop preserved across re-run"
  );
});

test("upsert throws if entry.key is missing", () => {
  assert.throws(() => upsertPoolPreservingTopLevel(LIVE_TOPLEVEL, { vault: "0x" }), /key required/);
});

// --- resolveRewardScope (daily-rewards isolation) ---------------------------

test("legacy reward scope points state at the top-level deployment (identical path)", () => {
  const dep = {
    hyperpoolVault: "0xLiveVault",
    projectXAdapter: "0xLiveAdapter",
    airdrop: "0xLiveAirdrop",
    tokenUSDC: "0xUSDC",
    referralRegistry: "0xRef",
    vaultDeployBlock: "39115156",
    vaultShareHolders: [{ address: "0xA", shares: "1" }],
  };
  const scope = resolveRewardScope(dep, undefined);
  assert.equal(scope.hypeQuoted, false);
  assert.equal(scope.vault, "0xLiveVault");
  assert.equal(scope.airdrop, "0xLiveAirdrop");
  assert.equal(scope.rewardToken, "0xUSDC", "legacy reward = USDC");
  assert.equal(scope.state, dep, "state IS the deployment object → byte-for-byte legacy behaviour");
  assert.equal(scope.vaultDeployBlock, "39115156");
});

test("pool reward scope isolates state into pool.cashdrop and rewards in WHYPE", () => {
  const whype = "0x5555555555555555555555555555555555555555";
  const dep = {
    hyperpoolVault: "0xLiveVault",
    airdrop: "0xLiveAirdrop",
    tokenUSDC: "0xUSDC",
    referralRegistry: "0xRef",
    vaultShareHolders: [{ address: "0xLIVE", shares: "999" }],
    pools: [
      {
        key: "ubtc-whype",
        vault: "0xVaultUbtc",
        adapter: "0xAdapterUbtc",
        airdrop: "0xAirdropUbtc",
        rewardToken: whype,
        quoteToken: whype,
        vaultDeployBlock: "50000000",
      },
    ],
  };
  const scope = resolveRewardScope(dep, "ubtc-whype");
  assert.equal(scope.hypeQuoted, true);
  assert.equal(scope.vault, "0xVaultUbtc");
  assert.equal(scope.airdrop, "0xAirdropUbtc");
  assert.equal(scope.rewardToken, whype, "pool reward = WHYPE");
  assert.equal(scope.referralRegistry, "0xRef", "shared referral registry falls back to top-level");
  // state is the pool's own cashdrop sub-object, created on demand.
  assert.equal(scope.state, dep.pools[0].cashdrop);
  assert.notEqual(scope.state, dep, "must NOT alias the live top-level state");
  // vaultDeployBlock mirrored into cashdrop scope so log scans start at the right block.
  assert.equal(scope.state.vaultDeployBlock, "50000000");
  // Writing pool cashdrop state must never leak into the live top-level fields.
  scope.state.vaultShareHolders = [{ address: "0xPOOL", shares: "1" }];
  assert.deepEqual(dep.vaultShareHolders, [{ address: "0xLIVE", shares: "999" }], "live holders untouched");
});

test("pool reward scope falls back to quoteToken when rewardToken absent", () => {
  const whype = "0x5555555555555555555555555555555555555555";
  const dep = {
    pools: [{ key: "ueth-whype", vault: "0xV", adapter: "0xA", airdrop: "0xD", quoteToken: whype }],
  };
  const scope = resolveRewardScope(dep, "ueth-whype");
  assert.equal(scope.rewardToken, whype);
});

test("pool reward scope throws when the pool lacks an airdrop", () => {
  const dep = { pools: [{ key: "x", vault: "0xV", adapter: "0xA" }] };
  assert.throws(() => resolveRewardScope(dep, "x"), /missing vault\/adapter\/airdrop/);
});

// --- mergeScopeOntoDisk (concurrent-run isolation) --------------------------
//
// daily-rewards loads the JSON once and saves it at the end. Two runs that overlap must not
// revert each other, so each save writes back only the fields its own scope owns.

test("a pool run writes only its own cashdrop entry and preserves top-level changes on disk", () => {
  const inMemory = {
    hyperpoolVault: "0xLiveVault",
    lastCashdropDistribution: { amount: "OLD" },
    pools: [{ key: "ubtc-whype", vault: "0xVaultUbtc", cashdrop: { merkleRoot: "0xNEW" } }],
  };
  // Meanwhile the legacy run finished and advanced the top-level distribution.
  const onDisk = {
    hyperpoolVault: "0xLiveVault",
    lastCashdropDistribution: { amount: "NEWER_FROM_LEGACY_RUN" },
    pools: [{ key: "ubtc-whype", vault: "0xVaultUbtc", cashdrop: {} }],
  };
  const out = mergeScopeOntoDisk(onDisk, inMemory, { key: "ubtc-whype", state: { merkleRoot: "0xNEW" } });

  assert.deepEqual(
    out.lastCashdropDistribution,
    { amount: "NEWER_FROM_LEGACY_RUN" },
    "the live pool's newer top-level state must survive"
  );
  assert.deepEqual(out.pools[0].cashdrop, { merkleRoot: "0xNEW" }, "our own pool cashdrop is written");
});

test("a legacy run keeps its top-level fields but never reverts pools[] on disk", () => {
  const inMemory = {
    hyperpoolVault: "0xLiveVault",
    lastCashdropDistribution: { amount: "FROM_LEGACY_RUN" },
    pools: [{ key: "ubtc-whype", cashdrop: {} }], // stale copy loaded before the pool run finished
  };
  const onDisk = {
    hyperpoolVault: "0xLiveVault",
    lastCashdropDistribution: { amount: "OLD" },
    pools: [{ key: "ubtc-whype", cashdrop: { merkleRoot: "0xPOOL" } }],
  };
  const out = mergeScopeOntoDisk(onDisk, inMemory, { key: null, state: inMemory });

  assert.deepEqual(out.lastCashdropDistribution, { amount: "FROM_LEGACY_RUN" });
  assert.deepEqual(out.pools[0].cashdrop, { merkleRoot: "0xPOOL" }, "the pool run's state must survive");
});

test("a pool missing from the on-disk file falls back to the in-memory object", () => {
  const inMemory = { pools: [{ key: "new-pool", cashdrop: { a: 1 } }] };
  const out = mergeScopeOntoDisk({ hyperpoolVault: "0xLive" }, inMemory, { key: "new-pool", state: { a: 1 } });
  assert.equal(out, inMemory);
});
