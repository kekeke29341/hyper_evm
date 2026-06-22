#!/usr/bin/env node
/**
 * Verify referral registry bindings and Cashdrop boost math on HyperEVM testnet.
 * Usage: node scripts/verify-referral-boost.mjs [walletAddress]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi, keccak256, toBytes } from "viem";

const REFERRER_BONUS_BPS = 1500n;
const REFEREE_BOOST_BPS = 1000n;

function simulateBoost(holders, pending, referrers) {
  const totalShares = holders.reduce((s, h) => s + h.shares, 0n);
  const raw = new Map();
  for (const holder of holders) {
    const base = (holder.shares * pending) / totalShares;
    if (base === 0n) continue;
    let amount = base;
    const referrer = referrers.get(holder.address.toLowerCase());
    if (referrer && referrer.toLowerCase() !== holder.address.toLowerCase()) {
      amount = base + (base * REFEREE_BOOST_BPS) / 10_000n;
      const commission = (base * REFERRER_BONUS_BPS) / 10_000n;
      const key = referrer.toLowerCase();
      raw.set(key, (raw.get(key) ?? 0n) + commission);
    }
    const key = holder.address.toLowerCase();
    raw.set(key, (raw.get(key) ?? 0n) + amount);
  }
  let entries = [...raw.entries()].map(([addr, amount]) => ({ address: addr, amount }));
  let sum = entries.reduce((s, e) => s + e.amount, 0n);
  if (sum !== pending && sum > 0n) {
    entries = entries.map((e) => ({ ...e, amount: (e.amount * pending) / sum }));
  }
  return entries;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const CHAIN_ID = 998;

const wallet =
  process.argv[2] ??
  process.env.MAIN_ADDRESS ??
  "0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC";

const d = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/998.json"), "utf8"));
const registry = d.referralRegistry;

const chain = {
  id: CHAIN_ID,
  name: "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const client = createPublicClient({ chain, transport: http(RPC) });
const referralAbi = parseAbi([
  "function getReferrer(address user) view returns (address)",
  "function referrerCode(address user) view returns (bytes32)",
  "function referralCount(address user) view returns (uint256)",
  "function codeToReferrer(bytes32 code) view returns (address)",
]);

function ok(label, detail) {
  console.log(`✓ ${label}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  console.log(`==> Referral boost verify (chain ${CHAIN_ID})`);
  console.log(`    Wallet: ${wallet}`);
  console.log(`    Registry: ${registry}`);

  const referrer = await client.readContract({
    address: registry,
    abi: referralAbi,
    functionName: "getReferrer",
    args: [wallet],
  });

  const ownCode = await client.readContract({
    address: registry,
    abi: referralAbi,
    functionName: "referrerCode",
    args: [wallet],
  });

  const referrals = await client.readContract({
    address: registry,
    abi: referralAbi,
    functionName: "referralCount",
    args: [wallet],
  });

  const zeroAddr = "0x0000000000000000000000000000000000000000";
  const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const hasBoost = referrer.toLowerCase() !== zeroAddr;

  ok("Referee boost bound", hasBoost ? `referrer ${referrer}` : "none");
  ok("Own referral code", ownCode === zeroHash ? "not registered" : ownCode);
  ok("Referrals made", String(referrals));

  const testCode = "HPTEST01";
  const codeHash = keccak256(toBytes(testCode));
  const codeOwner = await client.readContract({
    address: registry,
    abi: referralAbi,
    functionName: "codeToReferrer",
    args: [codeHash],
  });
  ok(`Code "${testCode}" owner`, codeOwner === zeroAddr ? "none" : codeOwner);

  if (hasBoost && d.vaultShareHolders?.length) {
    const holders = d.vaultShareHolders.map((h) => ({
      address: h.address,
      shares: BigInt(h.shares),
    }));
    const totalShares = holders.reduce((s, h) => s + h.shares, 0n);
    const referrers = new Map([[wallet.toLowerCase(), referrer]]);
    const pending = 10_000n;

    const withBoost = simulateBoost(holders, pending, referrers);
    const without = simulateBoost(holders, pending, new Map());

    const boosted = withBoost.find((e) => e.address === wallet.toLowerCase())?.amount ?? 0n;
    const base = without.find((e) => e.address === wallet.toLowerCase())?.amount ?? 0n;

    ok("Cashdrop allocation (10k USDC pool sim)", `base ${base} → with boost ${boosted}`);
    if (boosted > base) {
      ok("Boost effect", `+${Number((boosted - base) * 100n / (base || 1n)) / 100}% vs pro-rata base`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
