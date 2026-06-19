/**
 * Cashdrop allocation with referral boosts — must match frontend/src/lib/referral/allocation.ts
 */
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { getAddress } = viem;

export const REFERRER_BONUS_BPS = 1500n;
export const REFEREE_BOOST_BPS = 1000n;

function addAmount(map, address, delta) {
  if (delta === 0n) return;
  const key = address.toLowerCase();
  map.set(key, (map.get(key) ?? 0n) + delta);
}

export function normalizeCashdropEntries(raw, pending) {
  let entries = [...raw.entries()].map(([addr, amount]) => ({
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

export function buildCashdropEntries({ holders, pending, totalShares, referrers = new Map() }) {
  if (totalShares === 0n) throw new Error("totalShares is zero");
  if (pending === 0n) return [];

  const raw = new Map();

  for (const holder of holders) {
    const shares = BigInt(holder.shares);
    const base = (shares * pending) / totalShares;
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

export async function fetchReferrerMap(publicClient, registryAddress, holders) {
  const map = new Map();
  const zero = "0x0000000000000000000000000000000000000000";
  if (!registryAddress || registryAddress.toLowerCase() === zero) return map;

  const abi = [
    {
      type: "function",
      name: "getReferrer",
      stateMutability: "view",
      inputs: [{ name: "user", type: "address" }],
      outputs: [{ name: "", type: "address" }],
    },
  ];

  for (const holder of holders) {
    const referrer = await publicClient.readContract({
      address: registryAddress,
      abi,
      functionName: "getReferrer",
      args: [holder.address],
    });
    if (referrer && referrer.toLowerCase() !== zero) {
      map.set(holder.address.toLowerCase(), referrer);
    }
  }

  return map;
}
