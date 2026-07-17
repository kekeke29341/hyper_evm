import { getAddress, type Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";

export type VaultTransfer = {
  from: string;
  to: string;
  value: bigint;
  blockNumber: bigint;
  logIndex: number;
  timestamp: number;
};

export function isEligibleShareholder(address: string): boolean {
  const lower = address.toLowerCase();
  return lower !== ZERO && lower !== DEAD;
}

function toBalanceMap(initial: Map<string, bigint> | Record<string, string | bigint>): Map<string, bigint> {
  const balances = new Map<string, bigint>();
  if (initial instanceof Map) {
    for (const [addr, bal] of initial) balances.set(addr.toLowerCase(), bal);
    return balances;
  }
  for (const [addr, bal] of Object.entries(initial)) {
    balances.set(addr.toLowerCase(), BigInt(bal));
  }
  return balances;
}

/**
 * Integrate vault share balances over time (share-seconds) for a distribution period.
 * `transfers` must be sorted by (blockNumber, logIndex) — see sortVaultTransfers.
 */
export function computeShareSecondsFromTransfers(params: {
  periodStartTimestamp: number;
  periodEndTimestamp: number;
  initialBalances: Map<string, bigint> | Record<string, string | bigint>;
  transfers: VaultTransfer[];
}): { weighted: Map<string, bigint>; endBalances: Map<string, bigint> } {
  const { periodStartTimestamp, periodEndTimestamp, initialBalances, transfers } = params;
  const balances = toBalanceMap(initialBalances);
  const weighted = new Map<string, bigint>();

  if (periodEndTimestamp < periodStartTimestamp) {
    throw new Error("periodEndTimestamp must be >= periodStartTimestamp");
  }

  let cursor = periodStartTimestamp;

  function accrueUntil(ts: number) {
    if (ts < cursor) return;
    const dt = BigInt(ts - cursor);
    if (dt === 0n) return;
    for (const [addr, bal] of balances) {
      if (bal > 0n && isEligibleShareholder(addr)) {
        const key = addr.toLowerCase();
        weighted.set(key, (weighted.get(key) ?? 0n) + bal * dt);
      }
    }
    cursor = ts;
  }

  for (const transfer of transfers) {
    accrueUntil(transfer.timestamp);
    const from = transfer.from.toLowerCase();
    const to = transfer.to.toLowerCase();
    const value = transfer.value;
    if (isEligibleShareholder(from)) {
      balances.set(from, (balances.get(from) ?? 0n) - value);
    }
    if (isEligibleShareholder(to)) {
      balances.set(to, (balances.get(to) ?? 0n) + value);
    }
  }

  accrueUntil(periodEndTimestamp);

  return { weighted, endBalances: balances };
}

export function sortVaultTransfers(transfers: VaultTransfer[]): VaultTransfer[] {
  return [...transfers].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
}

export function weightedShareHolders(weighted: Map<string, bigint>): { address: Address; shares: bigint }[] {
  return [...weighted.entries()]
    .filter(([, w]) => w > 0n)
    .map(([address, shares]) => ({ address: getAddress(address), shares }))
    .sort((a, b) => a.address.localeCompare(b.address));
}

export function balancesToCheckpointRecord(balances: Map<string, bigint>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [addr, bal] of balances) {
    if (bal > 0n && isEligibleShareholder(addr)) out[getAddress(addr)] = bal.toString();
  }
  return out;
}
