/** Top-100 daily multiplier tiers (product spec). */
export function rankToMultiplier(rank: number | null): number {
  if (rank === null || rank <= 0) return 1;
  if (rank <= 3) return 3;
  if (rank <= 10) return 2;
  if (rank <= 100) return 1.5;
  return 1;
}

export function parseMultiplierLabel(label: string): number {
  const normalized = label.replace(/×/g, "").trim();
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 1;
}

export function formatMultiplier(rank: number | null): string {
  const m = rankToMultiplier(rank);
  return m === Math.floor(m) ? `×${m}.0` : `×${m}`;
}

export function multiplierBadgeClass(multiplier: number): string {
  if (multiplier >= 3) return "bg-emerald-500/20 text-emerald-400";
  if (multiplier >= 2) return "bg-cyan-500/20 text-cyan-400";
  if (multiplier > 1) return "bg-violet-500/20 text-violet-400";
  return "bg-zinc-700/50 text-zinc-400";
}

export type LeaderboardRow = {
  rank: number;
  address: string;
  addressFull: string;
  points: number;
  multiplier: string;
};

export function findUserRank(
  rows: { addressFull: string }[],
  userAddress: string | undefined
): number | null {
  if (!userAddress) return null;
  const lower = userAddress.toLowerCase();
  const idx = rows.findIndex((r) => r.addressFull.toLowerCase() === lower);
  return idx === -1 ? null : idx + 1;
}
