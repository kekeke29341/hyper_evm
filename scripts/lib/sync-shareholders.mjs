/**
 * Sync vaultShareHolders from on-chain Transfer events + balanceOf into deployment JSON files.
 */
import fs from "fs";
import path from "path";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
};

function isExcludedHolder(address) {
  const lower = address.toLowerCase();
  return lower === ZERO || lower === DEAD.toLowerCase();
}

/** Discover shareholder addresses from vault Transfer logs. */
export async function discoverVaultShareholderAddresses({
  publicClient,
  vault,
  fromBlock = 0n,
  extraAddresses = [],
  maxChunk = 999n,
}) {
  const addresses = new Set(extraAddresses.filter(Boolean).map((a) => a.toLowerCase()));

  const latest = await publicClient.getBlockNumber();
  let start = fromBlock;
  const lookback = 50_000n;
  if (start === 0n && latest > lookback) {
    start = latest - lookback;
  }

  while (start <= latest) {
    const end = start + maxChunk - 1n > latest ? latest : start + maxChunk - 1n;
    try {
      const logs = await publicClient.getLogs({
        address: vault,
        event: transferEvent,
        fromBlock: start,
        toBlock: end,
      });

      for (const log of logs) {
        const from = log.args?.from;
        const to = log.args?.to;
        if (from && !isExcludedHolder(from)) addresses.add(from.toLowerCase());
        if (to && !isExcludedHolder(to)) addresses.add(to.toLowerCase());
      }
    } catch (err) {
      console.warn(`Transfer scan skipped ${start}-${end}:`, err instanceof Error ? err.message : err);
      break;
    }

    start = end + 1n;
  }

  return [...addresses];
}

export async function syncVaultShareHolders({
  root,
  chain,
  deployment,
  publicClient,
  vault,
  vaultAbi,
  extraAddresses = [],
  fromBlock = 0n,
}) {
  const discovered = await discoverVaultShareholderAddresses({
    publicClient,
    vault,
    fromBlock,
    extraAddresses: [
      ...extraAddresses,
      ...(deployment.vaultShareHolders ?? []).map((h) => h.address),
    ],
  });

  const holders = [];
  for (const address of discovered) {
    if (isExcludedHolder(address)) continue;
    const shares = await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "balanceOf",
      args: [address],
    });
    if (shares > 0n) holders.push({ address, shares: shares.toString() });
  }

  holders.sort((a, b) => a.address.localeCompare(b.address));
  deployment.vaultShareHolders = holders;

  for (const p of [
    path.join(root, "contracts/deployments", `${chain}.json`),
    path.join(root, "frontend/src/lib/contracts/deployments", `${chain}.json`),
  ]) {
    if (fs.existsSync(path.dirname(p))) {
      fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
    }
  }

  return holders;
}

/** Sum of eligible shareholder balances (excludes dead shares). */
export function sumEligibleShares(holders) {
  return holders.reduce((sum, h) => sum + BigInt(h.shares), 0n);
}
