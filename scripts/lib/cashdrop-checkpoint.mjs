/**
 * Cashdrop checkpoint + pending-harvest state between cron phases.
 */
import fs from "fs";
import path from "path";

export function pendingCashdropPath(root, chain) {
  return path.join(root, "contracts/deployments", `.pending-cashdrop-${chain}.json`);
}

export function readPendingCashdrop(root, chain) {
  const p = pendingCashdropPath(root, chain);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writePendingCashdrop(root, chain, data) {
  const p = pendingCashdropPath(root, chain);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

export function clearPendingCashdrop(root, chain) {
  const p = pendingCashdropPath(root, chain);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** End-of-period balances for the next incremental log scan. */
export function checkpointFromHolders(holders, harvestBlock, harvestTimestamp) {
  const balances = {};
  for (const h of holders) {
    if (BigInt(h.shares) > 0n) {
      balances[h.address] = h.shares.toString();
    }
  }
  return {
    blockNumber: harvestBlock.toString(),
    timestamp: String(harvestTimestamp),
    balances,
  };
}
