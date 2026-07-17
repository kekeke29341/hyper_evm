import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const viem = await import(pathToFileURL(resolve(ROOT, "frontend/node_modules/viem/_esm/index.js")).href);
const { createPublicClient, http, getAddress, parseAbi } = viem;

const { buildCashdropEntries, fetchReferrerMap } = await import(
  pathToFileURL(resolve(ROOT, "scripts/lib/referral-allocation.mjs")).href
);

const MAINNET_RPC = process.env.MAINNET_RPC ?? "https://rpc.hyperliquid.xyz/evm";
const deployment999 = JSON.parse(
  readFileSync(resolve(ROOT, "frontend/src/lib/contracts/deployments/999.json"), "utf8")
);
const REGISTRY = deployment999.referralRegistry;
const OPS = "0x0196f2949FbcE973d54d2047E3B8bfAde06e8cec";

const referralAbi = parseAbi([
  "function isRegisteredReferrer(address) view returns (bool)",
  "function getReferrer(address user) view returns (address)",
  "function applyRefereeBoost(address user, uint256 baseRewardUsdc) view returns (uint256)",
]);

function mainnetClient() {
  return createPublicClient({
    chain: { id: 999, rpcUrls: { default: { http: [MAINNET_RPC] } } },
    transport: http(MAINNET_RPC),
  });
}

test("mainnet registry: ops wallet is registered referrer", async () => {
  const client = mainnetClient();
  const registered = await client.readContract({
    address: REGISTRY,
    abi: referralAbi,
    functionName: "isRegisteredReferrer",
    args: [getAddress(OPS)],
  });
  assert.equal(registered, true);
});

test("mainnet registry: getReferrer returns zero for unbound wallet", async () => {
  const client = mainnetClient();
  const holder = "0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55";
  const referrer = await client.readContract({
    address: REGISTRY,
    abi: referralAbi,
    functionName: "getReferrer",
    args: [getAddress(holder)],
  });
  assert.equal(referrer.toLowerCase(), "0x0000000000000000000000000000000000000000");
});

test("mainnet registry: applyRefereeBoost is 5% for hypothetical bound user", async () => {
  const client = mainnetClient();
  const boosted = await client.readContract({
    address: REGISTRY,
    abi: referralAbi,
    functionName: "applyRefereeBoost",
    args: [getAddress(OPS), 1000n],
  });
  // OPS is not a referee; boost should equal base
  assert.equal(boosted, 1000n);
});

test("fetchReferrerMap returns empty when no bindings exist", async () => {
  const client = mainnetClient();
  const bob = "0x2222222222222222222222222222222222222222";
  const map = await fetchReferrerMap(client, REGISTRY, [{ address: bob }]);
  assert.equal(map.size, 0);
});

test("cashdrop pipeline applies referrer commission from getReferrer map", () => {
  const alice = "0x1111111111111111111111111111111111111111";
  const bob = "0x2222222222222222222222222222222222222222";
  const referrers = new Map([[bob.toLowerCase(), alice]]);

  const entries = buildCashdropEntries({
    holders: [{ address: bob, shares: 100n }],
    pending: 10_000n,
    totalShares: 100n,
    referrers,
  });

  const sum = entries.reduce((s, e) => s + e.amount, 0n);
  assert.equal(sum, 10_000n);
  assert.equal(entries.find((e) => e.address === bob)?.amount, 8750n);
  assert.equal(entries.find((e) => e.address === alice)?.amount, 1250n);
});
