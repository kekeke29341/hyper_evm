import { describe, it, expect } from "vitest";
import type { Address } from "viem";
import { buildMerkleRoot, getMerkleProof, makeLeaf, parseAirdropCsv } from "@/lib/admin/merkle";

const ALICE = "0x1111111111111111111111111111111111111111" as Address;
const BOB = "0x2222222222222222222222222222222222222222" as Address;

describe("merkle", () => {
  const entries = [
    { address: ALICE, amount: BigInt(1000) },
    { address: BOB, amount: BigInt(500) },
  ];

  it("makeLeaf produces deterministic hashes", () => {
    const leaf = makeLeaf(ALICE, BigInt(1000));
    expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);
    expect(makeLeaf(ALICE, BigInt(1000))).toBe(leaf);
  });

  it("makeLeaf supports gated format with minShares", () => {
    const leaf = makeLeaf(ALICE, BigInt(1000), BigInt(500), true);
    expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);
    expect(makeLeaf(ALICE, BigInt(1000), BigInt(500), true)).toBe(leaf);
    expect(makeLeaf(ALICE, BigInt(1000), BigInt(0), false)).not.toBe(leaf);
  });

  it("buildMerkleRoot matches OpenZeppelin double-hash format", () => {
    const root = buildMerkleRoot(entries);
    expect(root).toMatch(/^0x[a-f0-9]{64}$/);
    expect(buildMerkleRoot(entries)).toBe(root);
  });

  it("getMerkleProof returns minShares for gated tree", () => {
    const gatedEntries = [
      { address: ALICE, amount: BigInt(1000), minShares: BigInt(100) },
      { address: BOB, amount: BigInt(500), minShares: BigInt(50) },
    ];
    const result = getMerkleProof(gatedEntries, ALICE, true);
    expect(result).not.toBeNull();
    expect(result!.minShares).toBe(BigInt(100));
  });

  it("getMerkleProof returns valid proof for member", () => {
    const result = getMerkleProof(entries, ALICE);
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(BigInt(1000));
    expect(Array.isArray(result!.proof)).toBe(true);
  });

  it("getMerkleProof returns null for non-member", () => {
    const outsider = "0x3333333333333333333333333333333333333333" as Address;
    expect(getMerkleProof(entries, outsider)).toBeNull();
  });

  it("parseAirdropCsv parses comma-separated lines", () => {
    const csv = `${ALICE},1000\n${BOB},500`;
    const parsed = parseAirdropCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].amount).toBe(BigInt(1000));
  });

  it("parseAirdropCsv rejects invalid address", () => {
    expect(() => parseAirdropCsv("not-an-address,100")).toThrow(/Invalid address/);
  });

  it("parseAirdropCsv rejects zero amount", () => {
    expect(() => parseAirdropCsv(`${ALICE},0`)).toThrow(/Amount must be positive/);
  });

  it("buildMerkleRoot throws on empty entries", () => {
    expect(() => buildMerkleRoot([])).toThrow("No entries");
  });
});
