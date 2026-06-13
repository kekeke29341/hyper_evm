import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  appendPointsSnapshot,
  historyStorageKey,
  snapshotsToChartData,
} from "@/lib/points/history";

describe("points history", () => {
  beforeEach(() => {
    const backing: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem(key: string) {
        return backing[key] ?? null;
      },
      setItem(key: string, value: string) {
        backing[key] = value;
      },
    });
  });

  it("builds storage key from chain and address", () => {
    expect(historyStorageKey(31337, "0xAbC")).toBe("prjx_pts_history_31337_0xabc");
  });

  it("appends snapshots and trims via localStorage", () => {
    const key = "test_key";
    appendPointsSnapshot(key, 100);
    appendPointsSnapshot(key, 150);
    const chart = snapshotsToChartData(
      [{ t: Date.now(), pts: 150 }],
      "en"
    );
    expect(chart.length).toBe(7);
    expect(chart.some((d) => d.pts >= 0)).toBe(true);
  });
});
