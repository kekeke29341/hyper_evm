import { concat, encodeAbiParameters, isAddress, keccak256, type Address, type Hex } from "viem";

export type AirdropEntry = { address: Address; amount: bigint };

export function makeLeaf(address: Address, amount: bigint): Hex {
  const inner = keccak256(
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

export function buildMerkleRoot(entries: AirdropEntry[]): Hex {
  if (entries.length === 0) throw new Error("No entries");
  let layer = entries.map((e) => makeLeaf(e.address, e.amount));
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
  target: Address
): { amount: bigint; proof: Hex[] } | null {
  const index = entries.findIndex((e) => e.address.toLowerCase() === target.toLowerCase());
  if (index === -1) return null;

  let layer = entries.map((e) => makeLeaf(e.address, e.amount));
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

  return { amount: entries[index].amount, proof };
}

export function parseAirdropCsv(text: string): AirdropEntry[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [addr, amt] = line.split(/[,\s]+/);
      if (!addr || !amt) throw new Error(`Invalid line: ${line}`);
      if (!isAddress(addr)) throw new Error(`Invalid address: ${addr}`);
      const amount = BigInt(amt);
      if (amount <= BigInt(0)) throw new Error(`Amount must be positive: ${line}`);
      return { address: addr as Address, amount };
    });
}
