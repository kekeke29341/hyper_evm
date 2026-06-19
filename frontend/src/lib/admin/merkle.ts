import { concat, encodeAbiParameters, isAddress, keccak256, type Address, type Hex } from "viem";

export type AirdropEntry = { address: Address; amount: bigint; minShares?: bigint };

export function makeLeaf(
  address: Address,
  amount: bigint,
  minShares = 0n,
  gated = false
): Hex {
  const inner = gated
    ? keccak256(
        encodeAbiParameters(
          [
            { name: "account", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "minShares", type: "uint256" },
          ],
          [address, amount, minShares]
        )
      )
    : keccak256(
        encodeAbiParameters(
          [
            { name: "account", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          [address, amount]
        )
      );
  return keccak256(concat([inner]));
}

function sortPair(a: Hex, b: Hex): [Hex, Hex] {
  return a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
}

function hashPair(a: Hex, b: Hex): Hex {
  const [x, y] = sortPair(a, b);
  return keccak256(concat([x, y]));
}

export function buildMerkleRoot(entries: AirdropEntry[], gated = false): Hex {
  if (entries.length === 0) throw new Error("No entries");
  const useGate = gated || entries.some((e) => e.minShares !== undefined && e.minShares > 0n);
  let layer = entries.map((e) => makeLeaf(e.address, e.amount, e.minShares ?? 0n, useGate));
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) next.push(hashPair(layer[i], layer[i + 1]));
      else next.push(layer[i]);
    }
    layer = next;
  }
  return layer[0];
}

export function getMerkleProof(
  entries: AirdropEntry[],
  target: Address,
  gated = false
): { amount: bigint; minShares: bigint; proof: Hex[] } | null {
  const index = entries.findIndex((e) => e.address.toLowerCase() === target.toLowerCase());
  if (index === -1) return null;

  const useGate = gated || entries.some((e) => e.minShares !== undefined && e.minShares > 0n);
  let layer = entries.map((e) => makeLeaf(e.address, e.amount, e.minShares ?? 0n, useGate));
  let idx = index;
  const proof: Hex[] = [];

  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        if (i === idx || i + 1 === idx) {
          proof.push(idx === i ? layer[i + 1] : layer[i]);
        }
        next.push(hashPair(layer[i], layer[i + 1]));
      } else {
        next.push(layer[i]);
      }
    }
    idx = Math.floor(idx / 2);
    layer = next;
  }

  const entry = entries[index];
  return {
    amount: entry.amount,
    minShares: entry.minShares ?? 0n,
    proof,
  };
}

export function parseAirdropCsv(text: string): AirdropEntry[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\s]+/);
      const addr = parts[0];
      const amt = parts[1];
      const minShares = parts[2];
      if (!addr || !amt) throw new Error(`Invalid line: ${line}`);
      if (!isAddress(addr)) throw new Error(`Invalid address: ${addr}`);
      const amount = BigInt(amt);
      if (amount <= BigInt(0)) throw new Error(`Amount must be positive: ${line}`);
      return {
        address: addr as Address,
        amount,
        minShares: minShares ? BigInt(minShares) : undefined,
      };
    });
}

/** Attach snapshot minShares from vault holder list (referrer-only → 1 share minimum). */
export function attachMinShares(
  entries: AirdropEntry[],
  holders: { address: Address; shares: bigint }[]
): AirdropEntry[] {
  const byAddr = new Map(holders.map((h) => [h.address.toLowerCase(), h.shares]));
  return entries.map((e) => ({
    ...e,
    minShares: byAddr.get(e.address.toLowerCase()) ?? 1n,
  }));
}
