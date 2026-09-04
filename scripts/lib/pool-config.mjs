/**
 * Pool resolution for the numeraire-agnostic keeper / daily-rewards scripts.
 *
 * Legacy (poolKey unset): the live HYPE/USDC vault from the top-level deployment JSON. The live
 * adapter is old bytecode without the generalized getters, so this path uses hardcoded legacy
 * constants (priceDiv 1e30, quote = USDC 6-dec) — reproducing the exact prior behaviour.
 *
 * HYPE-quoted (poolKey set): a deployment.pools[] entry (UPUMP/UBTC/UETH). No oracle; decimals and
 * priceDiv come from config. priceDiv = 10^(baseDec + 18 − quoteDec).
 */

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** priceDiv = 10^(baseDec + 18 − quoteDec). Bridges quote-per-base*1e18 to raw pool token units. */
export function priceDivFor(baseDecimals, quoteDecimals) {
  const exp = BigInt(baseDecimals) + 18n - BigInt(quoteDecimals);
  if (exp < 0n) throw new Error(`priceDiv exponent negative (base=${baseDecimals}, quote=${quoteDecimals})`);
  return 10n ** exp;
}

/** Quote-token amount (10^quoteDec) equivalent of a base amount, given price = quote-per-base*1e18. */
export function quoteFromBase(baseAmount, priceQuotePerBase18, priceDiv) {
  if (baseAmount === 0n || priceQuotePerBase18 === 0n) return 0n;
  return (BigInt(baseAmount) * BigInt(priceQuotePerBase18)) / BigInt(priceDiv);
}

/**
 * Upsert a pools[] entry into a deployment object WITHOUT mutating any top-level field.
 * Preserves accumulated `cashdrop` state on re-runs (only addresses/metadata refresh).
 * Throws if the resulting top-level (non-pools) shape differs byte-for-byte from the input —
 * the guard behind the security constraint "never touch the running HYPE/USDC top-level JSON".
 *
 * @param {object} existing parsed deployments/<chain>.json (returned object is a new copy)
 * @param {object} entry pools[] entry to insert/update (must have a `key`)
 * @returns {object} a new deployment object with pools[] upserted
 */
export function upsertPoolPreservingTopLevel(existing, entry) {
  if (!entry || !entry.key) throw new Error("upsertPool: entry.key required");
  const beforeTopLevel = JSON.stringify({ ...existing, pools: undefined });

  const pools = Array.isArray(existing.pools) ? existing.pools.slice() : [];
  const idx = pools.findIndex((p) => p.key === entry.key);
  if (idx === -1) {
    pools.push(entry);
  } else {
    const prev = existing.pools[idx].cashdrop;
    const prevCashdrop = prev && Object.keys(prev).length > 0 ? prev : entry.cashdrop;
    pools[idx] = { ...entry, cashdrop: prevCashdrop };
  }

  const updated = { ...existing, pools };
  const afterTopLevel = JSON.stringify({ ...updated, pools: undefined });
  if (beforeTopLevel !== afterTopLevel) {
    throw new Error("upsertPool: refusing to write — a top-level field would change");
  }
  return updated;
}

/**
 * Merge one scope's mutations onto the deployment JSON as it exists on disk RIGHT NOW.
 *
 * daily-rewards loads the JSON once at start and saves the whole object at the end, so two runs
 * that overlap in time (the legacy HYPE/USDC cron and a POOL_KEY cron, or two pools) would each
 * write a copy of the file that predates the other's changes — the later writer silently reverting
 * the earlier one's Cashdrop state. Re-reading here and writing back only the fields the current
 * scope owns makes the runs commutative:
 *   - legacy scope keeps its top-level fields but never overwrites pools[]
 *   - a pool scope replaces only its own pools[] entry's `cashdrop` and never touches top-level
 *
 * @param {object} onDisk freshly parsed deployment JSON
 * @param {object} inMemory the deployment object this process has been mutating
 * @param {{key: string|null, state: object}} scope from resolveRewardScope
 * @returns {object} the object to serialize
 */
export function mergeScopeOntoDisk(onDisk, inMemory, scope) {
  if (!onDisk || typeof onDisk !== "object") return inMemory;

  if (!scope.key) {
    // Legacy: everything this process changed is top-level. Carry the on-disk pools[] forward so a
    // concurrent pool run's Cashdrop state survives.
    return { ...inMemory, ...(onDisk.pools ? { pools: onDisk.pools } : {}) };
  }

  const pools = Array.isArray(onDisk.pools) ? onDisk.pools.slice() : [];
  const idx = pools.findIndex((p) => p.key === scope.key);
  if (idx === -1) {
    // The pool is not registered on disk yet — fall back to the in-memory object rather than
    // dropping this run's results.
    return inMemory;
  }
  pools[idx] = { ...pools[idx], cashdrop: scope.state };
  return { ...onDisk, pools };
}

/**
 * Resolve the Cashdrop reward scope for daily-rewards.
 *
 * Legacy (poolKey unset): `state` IS the top-level deployment object, so every existing read/write
 * of vaultShareHolders/airdropEntries/cashdropWeightCheckpoint/lastCashdropDistribution/
 * cashdropDistributionHistory/merkleRoot lands exactly where it does today — byte-for-byte
 * identical behaviour for the live HYPE/USDC pool. reward = tokenUSDC, airdrop = top-level airdrop.
 *
 * HYPE-quoted (poolKey set): `state` is the pool's own `cashdrop` sub-object (created if absent), so
 * per-pool Cashdrop state is fully isolated from the live top-level fields. reward = pool.rewardToken
 * (WHYPE), airdrop = pool.airdrop, vault = pool.vault. Top-level cashdrop fields are never touched.
 *
 * @param {object} deployment parsed deployments/<chain>.json (mutated in place for pool.cashdrop init)
 * @param {string|undefined} poolKey value of POOL_KEY env
 * @returns {{key, vault, adapter, airdrop, rewardToken, referralRegistry, state, vaultDeployBlock, hypeQuoted}}
 */
export function resolveRewardScope(deployment, poolKey) {
  if (poolKey) {
    const pools = Array.isArray(deployment.pools) ? deployment.pools : [];
    const p = pools.find((x) => x.key === poolKey);
    if (!p) throw new Error(`POOL_KEY=${poolKey} not found in deployment.pools[]`);
    if (!p.vault || !p.adapter || !p.airdrop) {
      throw new Error(`pools[${poolKey}] missing vault/adapter/airdrop`);
    }
    if (!p.cashdrop || typeof p.cashdrop !== "object") p.cashdrop = {};
    // deployFromBlock/incrementalLogFromBlock read state.vaultDeployBlock — mirror the pool's.
    if (p.cashdrop.vaultDeployBlock == null && p.vaultDeployBlock != null) {
      p.cashdrop.vaultDeployBlock = p.vaultDeployBlock;
    }
    return {
      key: poolKey,
      vault: p.vault,
      adapter: p.adapter,
      airdrop: p.airdrop,
      rewardToken: p.rewardToken ?? p.quoteToken,
      referralRegistry: p.referralRegistry ?? deployment.referralRegistry,
      state: p.cashdrop,
      vaultDeployBlock: p.vaultDeployBlock ?? null,
      hypeQuoted: true,
    };
  }
  return {
    key: null,
    vault: deployment.hyperpoolVault ?? deployment.liquidityVault,
    adapter: deployment.projectXAdapter,
    airdrop: deployment.airdrop,
    rewardToken: deployment.tokenUSDC,
    referralRegistry: deployment.referralRegistry,
    state: deployment,
    vaultDeployBlock: deployment.vaultDeployBlock ?? null,
    hypeQuoted: false,
  };
}

/**
 * @param {object} deployment parsed deployments/<chain>.json
 * @param {string|undefined} poolKey value of POOL_KEY env (undefined → legacy top-level)
 * @returns resolved config { key, vault, adapter, oracle, baseToken, quoteToken,
 *          quoteDecimals, baseDecimals, priceDiv, humanDivisor, hypeQuoted }
 */
export function resolvePool(deployment, poolKey) {
  if (poolKey) {
    const pools = Array.isArray(deployment.pools) ? deployment.pools : [];
    const p = pools.find((x) => x.key === poolKey);
    if (!p) throw new Error(`POOL_KEY=${poolKey} not found in deployment.pools[]`);
    if (!p.vault || !p.adapter) throw new Error(`pools[${poolKey}] missing vault/adapter`);
    const qd = Number(p.quoteDecimals ?? 18);
    const bd = Number(p.baseDecimals ?? 18);
    return {
      key: poolKey,
      vault: p.vault,
      adapter: p.adapter,
      oracle: p.oracle && p.oracle !== ZERO_ADDR ? p.oracle : null,
      baseToken: p.baseToken,
      quoteToken: p.quoteToken,
      quoteDecimals: qd,
      baseDecimals: bd,
      quoteSymbol: p.quoteSymbol ?? "quote",
      baseSymbol: p.baseSymbol ?? "base",
      priceDiv: priceDivFor(bd, qd),
      humanDivisor: 10n ** BigInt(qd),
      // deployIdle floor, in whole quote tokens. The legacy default of 10 means 10 USDC; for a
      // WHYPE-quoted pool the same number would be ~10 HYPE (a few hundred dollars), so idle would
      // sit undeployed for a long time. Default low and let each pool override.
      minIdleDeploy: Number(p.minIdleDeployQuote ?? 0.2),
      hypeQuoted: true,
    };
  }
  return {
    key: null,
    vault: deployment.hyperpoolVault ?? deployment.liquidityVault,
    adapter: deployment.projectXAdapter,
    oracle: deployment.oracle && deployment.oracle !== ZERO_ADDR ? deployment.oracle : null,
    baseToken: deployment.tokenKHYPE,
    quoteToken: deployment.tokenUSDC,
    quoteDecimals: 6,
    baseDecimals: 18,
    quoteSymbol: "USDC",
    baseSymbol: "HYPE",
    priceDiv: 10n ** 30n,
    humanDivisor: 10n ** 6n,
    minIdleDeploy: 10,
    hypeQuoted: false,
  };
}
