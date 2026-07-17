#!/usr/bin/env node
/**
 * Verify wallet-based referral links: URL build/parse + optional on-chain registration lookup.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";

const viem = await import(pathToFileURL(resolve(ROOT, "frontend/node_modules/viem/_esm/index.js")).href);
const { createPublicClient, http, getAddress, isAddress } = viem;

const referralAllocation = await import(
  pathToFileURL(resolve(ROOT, "scripts/lib/referral-allocation.mjs")).href
);

const deployment = JSON.parse(
  readFileSync(resolve(ROOT, "contracts/deployments/998.json"), "utf8")
);
const registry = deployment.referralRegistry;
const ORIGIN = "https://hyper-evm-ten.vercel.app";
const sampleReferrer = "0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC";

function ok(label, detail = "") {
  console.log(`✓ ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, detail = "") {
  console.error(`✗ ${label}${detail ? `: ${detail}` : ""}`);
  process.exitCode = 1;
}

function buildReferralUrl(origin, referrerAddress) {
  return `${origin}/affiliate?referrer=${getAddress(referrerAddress)}`;
}

function parseReferralSearchParams(search) {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const referrerParam = params.get("referrer")?.trim();
  if (referrerParam && isAddress(referrerParam)) {
    return { referrerAddress: getAddress(referrerParam) };
  }
  return { referrerAddress: null };
}

console.log("==> Referral link verification");

const url = buildReferralUrl(ORIGIN, sampleReferrer);
const parsed = parseReferralSearchParams(url.split("?")[1] ?? "");
if (parsed.referrerAddress?.toLowerCase() === getAddress(sampleReferrer).toLowerCase()) {
  ok("buildReferralUrl + parse", url);
} else {
  fail("URL round-trip", JSON.stringify(parsed));
}

const legacy = parseReferralSearchParams("?ref=MYCODE12");
if (legacy.referrerAddress === null) ok("legacy ?ref= ignored");
else fail("legacy parse should ignore plain codes");

// Cashdrop referral math still at 5% / 15%
const { buildCashdropEntries, REFEREE_BOOST_BPS, REFERRER_BONUS_BPS } = referralAllocation;
if (REFEREE_BOOST_BPS === 500n && REFERRER_BONUS_BPS === 1500n) {
  ok("allocation BPS", "5% referee / 15% referrer");
} else {
  fail("allocation BPS", `${REFEREE_BOOST_BPS}/${REFERRER_BONUS_BPS}`);
}

const entries = buildCashdropEntries({
  holders: [{ address: "0x2222222222222222222222222222222222222222", shares: 100n }],
  pending: 10_000n,
  totalShares: 100n,
  referrers: new Map([["0x2222222222222222222222222222222222222222", "0x1111111111111111111111111111111111111111"]]),
});
const bob = entries.find((e) => e.address.toLowerCase().startsWith("0x2222"));
const alice = entries.find((e) => e.address.toLowerCase().startsWith("0x1111"));
if (bob?.amount === 8750n && alice?.amount === 1250n) {
  ok("cashdrop split with referral", "8750 / 1250");
} else {
  fail("cashdrop split", `${bob?.amount} / ${alice?.amount}`);
}

const client = createPublicClient({
  chain: { id: 998, rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC),
});

const lookup = process.argv[2] && isAddress(process.argv[2]) ? getAddress(process.argv[2]) : getAddress(sampleReferrer);
const abi = [
  {
    type: "function",
    name: "isRegisteredReferrer",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
];
const registered = await client.readContract({
  address: registry,
  abi,
  functionName: "isRegisteredReferrer",
  args: [lookup],
});
if (registered) {
  ok(`on-chain isRegisteredReferrer(${lookup})`, "true");
} else {
  console.log(`— not registered for ${lookup} (optional live test skipped)`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("\nAll checks passed.");
