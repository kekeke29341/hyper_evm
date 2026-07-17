export type ReferralPayoutRecord = {
  t: number;
  usdc: number;
  txHash?: string;
  /** referee → referrer attribution when stored off-chain */
  kind?: "referrer" | "from-referee";
};

const MAX_AGE_MS = 366 * 24 * 60 * 60 * 1000;

export function referralPayoutStorageKey(
  chainId: number,
  address: string,
  kind: "referrer" | "from-referee"
): string {
  return `hyperpool_referral_${kind}_${chainId}_${address.toLowerCase()}`;
}

export function loadReferralPayoutHistory(key: string): ReferralPayoutRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReferralPayoutRecord[];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter((r) => r.t >= cutoff && Number.isFinite(r.usdc) && r.usdc > 0);
  } catch {
    return [];
  }
}

export function appendReferralPayoutRecord(
  key: string,
  record: ReferralPayoutRecord,
  now = Date.now()
): ReferralPayoutRecord[] {
  if (typeof window === "undefined" || record.usdc <= 0) return [];

  const list = loadReferralPayoutHistory(key);
  const isDupe = list.some(
    (r) =>
      (record.txHash && r.txHash === record.txHash) ||
      (Math.abs(r.t - record.t) < 120_000 && Math.abs(r.usdc - record.usdc) < 0.001)
  );
  if (isDupe) return list;

  list.push(record);
  list.sort((a, b) => a.t - b.t);
  const trimmed = list.filter((r) => r.t >= now - MAX_AGE_MS);
  localStorage.setItem(key, JSON.stringify(trimmed));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hyperpool:referral-payout-updated", { detail: { key } }));
  }
  return trimmed;
}

export function mergeReferralPayoutRows(
  onChain: ReferralPayoutRecord[],
  local: ReferralPayoutRecord[]
): ReferralPayoutRecord[] {
  const merged = [...onChain];
  for (const localRow of local) {
    const isDupe = onChain.some(
      (row) =>
        (localRow.txHash && row.txHash === localRow.txHash) ||
        (Math.abs(row.t - localRow.t) < 120_000 && Math.abs(row.usdc - localRow.usdc) < 0.001)
    );
    if (!isDupe) merged.push(localRow);
  }
  return merged.sort((a, b) => b.t - a.t);
}
