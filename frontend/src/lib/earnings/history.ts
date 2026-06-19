export type EarningsClaim = { t: number; usdc: number; txHash?: string };

export type EarningsChartPoint = { label: string; value: number; cumulative?: number };

export type EarningsChartMode = "cumulative" | "yearly" | "monthly" | "daily";

const MAX_AGE_MS = 366 * 24 * 60 * 60 * 1000;

export function earningsStorageKey(chainId: number, address: string): string {
  return `hyperpool_earnings_${chainId}_${address.toLowerCase()}`;
}

export function positionStartStorageKey(chainId: number, address: string): string {
  return `hyperpool_position_start_${chainId}_${address.toLowerCase()}`;
}

export function loadEarningsHistory(key: string): EarningsClaim[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EarningsClaim[];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter((c) => c.t >= cutoff && Number.isFinite(c.usdc) && c.usdc > 0);
  } catch {
    return [];
  }
}

export function appendEarningsClaim(key: string, usdc: number, now = Date.now()): EarningsClaim[] {
  if (typeof window === "undefined" || usdc <= 0) return [];
  const list = loadEarningsHistory(key);
  const dayStart = startOfLocalDay(now);
  const existing = list.findIndex((c) => startOfLocalDay(c.t) === dayStart);
  if (existing >= 0) {
    list[existing] = { t: now, usdc: list[existing].usdc + usdc };
  } else {
    list.push({ t: now, usdc });
  }
  list.sort((a, b) => a.t - b.t);
  const cutoff = now - MAX_AGE_MS;
  const trimmed = list.filter((c) => c.t >= cutoff);
  localStorage.setItem(key, JSON.stringify(trimmed));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hyperpool:earnings-updated", { detail: { key } }));
  }
  return trimmed;
}

export function loadPositionStart(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const t = Number(raw);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function ensurePositionStart(key: string, now = Date.now()): number {
  const existing = loadPositionStart(key);
  if (existing !== null) return existing;
  localStorage.setItem(key, String(now));
  return now;
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function yearKey(ts: number): string {
  return String(new Date(ts).getFullYear());
}

function formatDayLabel(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    month: "numeric",
    day: "numeric",
  });
}

function formatMonthLabel(key: string, locale: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
  });
}

function formatYearLabel(key: string): string {
  return key;
}

function aggregateByKey(claims: EarningsClaim[], keyFn: (ts: number) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of claims) {
    const k = keyFn(c.t);
    map.set(k, (map.get(k) ?? 0) + c.usdc);
  }
  return map;
}

export function buildEarningsChartData(
  claims: EarningsClaim[],
  mode: EarningsChartMode,
  locale: string,
  daysBack = 30
): EarningsChartPoint[] {
  if (claims.length === 0) return [];

  if (mode === "yearly") {
    const byYear = aggregateByKey(claims, yearKey);
    const keys = [...byYear.keys()].sort();
    let cumulative = 0;
    return keys.map((k) => {
      const value = byYear.get(k) ?? 0;
      cumulative += value;
      return { label: formatYearLabel(k), value, cumulative };
    });
  }

  if (mode === "monthly") {
    const byMonth = aggregateByKey(claims, monthKey);
    const keys = [...byMonth.keys()].sort();
    let cumulative = 0;
    return keys.map((k) => {
      const value = byMonth.get(k) ?? 0;
      cumulative += value;
      return { label: formatMonthLabel(k, locale), value, cumulative };
    });
  }

  const byDay = aggregateByKey(claims, dayKey);
  const now = Date.now();
  const points: EarningsChartPoint[] = [];
  let cumulative = 0;

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const k = dayKey(d.getTime());
    const value = byDay.get(k) ?? 0;
    cumulative += value;
    points.push({
      label: formatDayLabel(d.getTime(), locale),
      value: mode === "daily" ? value : cumulative,
      cumulative,
    });
  }

  if (mode === "cumulative") {
    const totalBeforeWindow = claims
      .filter((c) => startOfLocalDay(c.t) < startOfLocalDay(now - (daysBack - 1) * 24 * 60 * 60 * 1000))
      .reduce((s, c) => s + c.usdc, 0);
    return points.map((p) => ({
      ...p,
      value: totalBeforeWindow + (p.cumulative ?? 0),
    }));
  }

  return points;
}

export function computeEarningsMetrics(
  claims: EarningsClaim[],
  positionValueUsd: number,
  positionStart: number | null,
  _referenceAprPercent: number,
  now = Date.now()
) {
  const totalEarned = claims.reduce((s, c) => s + c.usdc, 0);

  const todayKey = dayKey(now);
  const byDay = aggregateByKey(claims, dayKey);
  const earned24h = byDay.get(todayKey) ?? 0;

  const operatingDays =
    positionStart !== null
      ? Math.max(1, Math.ceil((now - startOfLocalDay(positionStart)) / (24 * 60 * 60 * 1000)))
      : 0;

  const monthlyAverage =
    operatingDays > 0 ? (totalEarned / operatingDays) * 30 : 0;

  const estimatedApr =
    positionValueUsd > 0 && operatingDays > 0 && totalEarned > 0
      ? ((totalEarned / positionValueUsd) / operatingDays) * 365 * 100
      : null;

  return {
    totalEarned,
    earned24h,
    operatingDays,
    monthlyAverage,
    estimatedApr,
  };
}

export function monthlyEarningsSummary(
  claims: EarningsClaim[],
  locale: string,
  months = 6
): { label: string; value: number }[] {
  const byMonth = aggregateByKey(claims, monthKey);
  const now = new Date();
  const rows: { label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = monthKey(d.getTime());
    rows.push({
      label: formatMonthLabel(k, locale),
      value: byMonth.get(k) ?? 0,
    });
  }
  return rows;
}

/** Merge on-chain claims with local browser cache (on-chain wins on duplicates). */
export function mergeEarningsClaims(onChain: EarningsClaim[], local: EarningsClaim[]): EarningsClaim[] {
  const merged = [...onChain];
  for (const localClaim of local) {
    const isDupe = onChain.some(
      (onChainClaim) =>
        (localClaim.txHash && onChainClaim.txHash === localClaim.txHash) ||
        (Math.abs(onChainClaim.t - localClaim.t) < 120_000 &&
          Math.abs(onChainClaim.usdc - localClaim.usdc) < 0.001)
    );
    if (!isDupe) merged.push(localClaim);
  }
  return merged.sort((a, b) => a.t - b.t);
}
