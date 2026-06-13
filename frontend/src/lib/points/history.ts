export type PointsSnapshot = { t: number; pts: number };

export type ChartPoint = { day: string; pts: number };

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function historyStorageKey(chainId: number, address: string): string {
  return `prjx_pts_history_${chainId}_${address.toLowerCase()}`;
}

export function loadPointsHistory(key: string): PointsSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PointsSnapshot[];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter((s) => s.t >= cutoff && Number.isFinite(s.pts));
  } catch {
    return [];
  }
}

export function appendPointsSnapshot(
  key: string,
  pts: number,
  now = Date.now()
): PointsSnapshot[] {
  if (typeof window === "undefined") return [];
  const list = loadPointsHistory(key);
  const last = list[list.length - 1];
  if (last && Math.abs(last.pts - pts) < 0.001 && now - last.t < 30_000) {
    return list;
  }
  list.push({ t: now, pts });
  const cutoff = now - MAX_AGE_MS;
  const trimmed = list.filter((s) => s.t >= cutoff);
  localStorage.setItem(key, JSON.stringify(trimmed));
  return trimmed;
}

export function snapshotsToChartData(
  snapshots: PointsSnapshot[],
  locale: string
): ChartPoint[] {
  if (snapshots.length === 0) return [];

  const byDay = new Map<string, number>();
  for (const s of snapshots) {
    const label = new Date(s.t).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
      weekday: "short",
    });
    byDay.set(label, Math.max(byDay.get(label) ?? 0, s.pts));
  }

  const days: ChartPoint[] = [];
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const label = d.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
      weekday: "short",
    });
    days.push({ day: label, pts: byDay.get(label) ?? 0 });
  }
  return days;
}
