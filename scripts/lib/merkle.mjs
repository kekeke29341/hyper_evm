/**
 * Shared Merkle tree builder — must match frontend/src/lib/admin/merkle.ts
 */
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { concat, encodeAbiParameters, getAddress, keccak256 } = viem;

export function makeLeaf(address, amount, minShares = 0n, gated = false) {
  const inner = gated
    ? keccak256(
        encodeAbiParameters(
          [
            { name: "account", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "minShares", type: "uint256" },
          ],
          [getAddress(address), amount, minShares]
        )
      )
    : keccak256(
        encodeAbiParameters(
          [
            { name: "account", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          [getAddress(address), amount]
        )
      );
  return keccak256(concat([inner]));
}

function sortPair(a, b) {
  return a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
}

function hashPair(a, b) {
  const [x, y] = sortPair(a, b);
  return keccak256(concat([x, y]));
}

export function buildMerkleRoot(entries, gated = false) {
  if (entries.length === 0) throw new Error("No entries");
  const useGate = gated || entries.some((e) => e.minShares !== undefined && BigInt(e.minShares ?? 0) > 0n);
  let layer = entries.map((e) =>
    makeLeaf(e.address, e.amount, BigInt(e.minShares ?? 0), useGate)
  );
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) next.push(hashPair(layer[i], layer[i + 1]));
      else next.push(layer[i]);
    }
    layer = next;
  }
  return layer[0];
}

export function attachMinShares(entries, holders) {
  const byAddr = new Map(holders.map((h) => [h.address.toLowerCase(), BigInt(h.shares)]));
  return entries.map((e) => ({
    ...e,
    minShares: (byAddr.get(e.address.toLowerCase()) ?? 1n).toString(),
  }));
}

export function getMerkleProof(entries, target, gated = false) {
  const idx = entries.findIndex((e) => e.address.toLowerCase() === target.toLowerCase());
  if (idx === -1) return null;

  const useGate = gated || entries.some((e) => e.minShares !== undefined && BigInt(e.minShares ?? 0) > 0n);
  let layer = entries.map((e) =>
    makeLeaf(e.address, e.amount, BigInt(e.minShares ?? 0), useGate)
  );
  let index = idx;
  const proof = [];

  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        if (i === index || i + 1 === index) {
          proof.push(index === i ? layer[i + 1] : layer[i]);
        }
        const [x, y] =
          layer[i].toLowerCase() <= layer[i + 1].toLowerCase()
            ? [layer[i], layer[i + 1]]
            : [layer[i + 1], layer[i]];
        next.push(keccak256(concat([x, y])));
      } else next.push(layer[i]);
    }
    index = Math.floor(index / 2);
    layer = next;
  }

  const entry = entries[idx];
  return {
    amount: BigInt(entry.amount),
    minShares: BigInt(entry.minShares ?? 0),
    proof,
  };
}

export function parseShareHoldersCsv(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [addr, shares] = line.split(/[,\s]+/);
      if (!addr || !shares) throw new Error(`Invalid line: ${line}`);
      return { address: getAddress(addr), shares: BigInt(shares) };
    });
}
