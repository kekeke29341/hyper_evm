export type RebalanceEvent = {
  id: string;
  timestamp: number;
  price: number;
  lower: number;
  upper: number;
  rangePct: number;
  action: "create" | "add" | "remove" | "deposit";
  amountUsd?: number;
};

const STORAGE_KEY = "hyperpool_rebalance_history";

export function readRebalanceHistory(): RebalanceEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RebalanceEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendRebalanceEvent(event: Omit<RebalanceEvent, "id" | "timestamp">): RebalanceEvent[] {
  const entry: RebalanceEvent = {
    ...event,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  const next = [entry, ...readRebalanceHistory()].slice(0, 20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
