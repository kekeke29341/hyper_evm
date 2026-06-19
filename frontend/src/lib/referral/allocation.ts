import { getAddress, type Address } from "viem";

/** Must match ReferralRegistry.sol */
export const REFERRER_BONUS_BPS = 1500n;
export const REFEREE_BOOST_BPS = 1000n;

export type ShareHolder = { address: Address; shares: bigint };

export type CashdropEntry = { address: Address; amount: bigint; minShares?: bigint };

export type ReferrerLookup = Map<string, Address>;

function addAmount(map: Map<string, bigint>, address: Address, delta: bigint) {
  if (delta === 0n) return;
  const key = address.toLowerCase();
  map.set(key, (map.get(key) ?? 0n) + delta);
}

/** Scale raw weights so total claimed USDC equals the vault pending pool. */
export function normalizeCashdropEntries(
  raw: Map<string, bigint>,
  pending: bigint
): CashdropEntry[] {
  let entries: CashdropEntry[] = [...raw.entries()].map(([addr, amount]) => ({
    address: getAddress(addr),
    amount,
  }));

  if (pending === 0n) return [];
  if (entries.length === 0) return [];

  let sum = entries.reduce((s, e) => s + e.amount, 0n);
  if (sum === 0n) return [];

  if (sum !== pending) {
    entries = entries.map((e) => ({
      address: e.address,
      amount: (e.amount * pending) / sum,
    }));
    sum = entries.reduce((s, e) => s + e.amount, 0n);
    const diff = pending - sum;
    if (diff !== 0n) {
      entries.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
      entries[0] = { ...entries[0], amount: entries[0].amount + diff };
    }
  }

  return entries.filter((e) => e.amount > 0n);
}

/**
 * Build Merkle airdrop rows: Vault pro-rata base, +10% referee boost, +15% referrer commission.
 * `totalShares` should be the sum of eligible holder balances (excluding dead shares).
 * When boosts exceed the fixed pool, amounts are scaled proportionally to `pending`.
 */
export function buildCashdropEntries(params: {
  holders: ShareHolder[];
  pending: bigint;
  totalShares: bigint;
  referrers?: ReferrerLookup;
}): CashdropEntry[] {
  const { holders, pending, totalShares, referrers = new Map() } = params;
  if (totalShares === 0n) throw new Error("totalShares is zero");
  if (pending === 0n) return [];

  const raw = new Map<string, bigint>();

  for (const holder of holders) {
    const base = (holder.shares * pending) / totalShares;
    if (base === 0n) continue;

    let holderAmount = base;
    const referrer = referrers.get(holder.address.toLowerCase());
    if (referrer && referrer.toLowerCase() !== holder.address.toLowerCase()) {
      holderAmount = base + (base * REFEREE_BOOST_BPS) / 10_000n;
      const commission = (base * REFERRER_BONUS_BPS) / 10_000n;
      addAmount(raw, referrer, commission);
    }
    addAmount(raw, holder.address, holderAmount);
  }

  return normalizeCashdropEntries(raw, pending);
}

/** Attach harvest-time vault shares for Merkle claim gating. */
export function attachSnapshotMinShares(
  entries: CashdropEntry[],
  holders: ShareHolder[]
): CashdropEntry[] {
  const byAddr = new Map(holders.map((h) => [h.address.toLowerCase(), h.shares]));
  return entries.map((e) => ({
    ...e,
    minShares: byAddr.get(e.address.toLowerCase()) ?? 1n,
  }));
}
