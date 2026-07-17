import test from "node:test";
import assert from "node:assert/strict";

import { incrementalLogFromBlock } from "../lib/sync-shareholders.mjs";

test("incrementalLogFromBlock uses checkpoint when present", () => {
  const deployment = {
    cashdropWeightCheckpoint: { blockNumber: "1000" },
    lastCashdropDistribution: { harvestBlock: "500" },
  };
  assert.equal(incrementalLogFromBlock(999, deployment), 1001n);
});

test("incrementalLogFromBlock falls back to last harvest", () => {
  const deployment = {
    lastCashdropDistribution: { harvestBlock: "500" },
  };
  assert.equal(incrementalLogFromBlock(999, deployment), 501n);
});

test("incrementalLogFromBlock uses vault deploy block on mainnet", () => {
  assert.equal(incrementalLogFromBlock(999, {}), 39_115_156n);
});
