import { describe, it, expect } from "vitest";
import {
  rankToMultiplier,
  formatMultiplier,
  findUserRank,
} from "@/lib/points/multiplier";

describe("multiplier", () => {
  it("assigns tier multipliers by rank", () => {
    expect(rankToMultiplier(1)).toBe(3);
    expect(rankToMultiplier(3)).toBe(3);
    expect(rankToMultiplier(4)).toBe(2);
    expect(rankToMultiplier(10)).toBe(2);
    expect(rankToMultiplier(11)).toBe(1.5);
    expect(rankToMultiplier(100)).toBe(1.5);
    expect(rankToMultiplier(101)).toBe(1);
    expect(rankToMultiplier(null)).toBe(1);
  });

  it("formats multiplier label", () => {
    expect(formatMultiplier(1)).toBe("×3.0");
    expect(formatMultiplier(50)).toBe("×1.5");
  });

  it("finds user rank in leaderboard rows", () => {
    const rows = [
      { addressFull: "0x1111111111111111111111111111111111111111" },
      { addressFull: "0x2222222222222222222222222222222222222222" },
    ];
    expect(findUserRank(rows, "0x1111111111111111111111111111111111111111")).toBe(1);
    expect(findUserRank(rows, "0x9999999999999999999999999999999999999999")).toBeNull();
    expect(findUserRank(rows, undefined)).toBeNull();
  });
});
