#!/usr/bin/env node
/**
 * HyperEVM Testnet CLI bootstrap:
 *   claimDrip → buy HYPE (spot) → bridge to EVM → enable big blocks
 *
 * Usage:
 *   node scripts/testnet-bootstrap.mjs
 *   node scripts/testnet-bootstrap.mjs --skip-drip --skip-buy   # already funded
 *   node scripts/testnet-bootstrap.mjs --bridge-amount 0.5
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const TESTNET_INFO = "https://api.hyperliquid-testnet.xyz/info";
const EVM_RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const HYPE_SYSTEM = "0x2222222222222222222222222222222222222222";

const HYPE_TOKEN_INDEX = 1105;
const HYPE_TOKEN_ID = "0x7317beb7cceed72ef0b346074cc8e7ab";
const HYPE_SPOT_PAIR = "@1035";
const HYPE_SPOT_ASSET_ID = 11035;

const DEFAULT_BRIDGE_HYPE = process.env.BRIDGE_HYPE_AMOUNT ?? "0.5";
const MIN_EVM_WEI = BigInt(process.env.MIN_EVM_HYPE_WEI ?? "100000000000000000"); // 0.1 HYPE

function parseArgs(argv) {
  const flags = new Set();
  const opts = { bridgeAmount: DEFAULT_BRIDGE_HYPE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-drip") flags.add("skipDrip");
    else if (a === "--skip-buy") flags.add("skipBuy");
    else if (a === "--skip-bridge") flags.add("skipBridge");
    else if (a === "--skip-big-blocks") flags.add("skipBigBlocks");
    else if (a === "--bridge-amount") opts.bridgeAmount = argv[++i];
    else if (a === "--help" || a === "-h") flags.add("help");
  }
  return { flags, opts };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function resolveWalletEnv() {
  loadEnvFile(path.join(root, ".env.testnet"));
  let privateKey = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
  let address = process.env.MAIN_ADDRESS || process.env.ADDRESS;
  if (!privateKey) return { privateKey: null, address };
  if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;
  return { privateKey, address };
}

async function hlImport(subpath) {
  const p = path.join(root, "frontend/node_modules/@nktkas/hyperliquid/esm", subpath);
  return import(pathToFileURL(p).href);
}

async function viemImport(subpath) {
  const p = path.join(root, "frontend/node_modules/viem/_esm", subpath);
  return import(pathToFileURL(p).href);
}

async function postInfo(body) {
  const res = await fetch(TESTNET_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getSpotBalances(user) {
  const state = await postInfo({ type: "spotClearinghouseState", user });
  const map = {};
  for (const b of state?.balances ?? []) {
    map[b.coin] = b.total;
  }
  return map;
}

async function getMid(pairName) {
  const mids = await postInfo({ type: "allMids" });
  const px = mids?.[pairName];
  if (!px) throw new Error(`No mid price for ${pairName}`);
  return Number(px);
}

async function getEvmBalanceWei(address, publicClient) {
  return publicClient.getBalance({ address });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForEvmBalance(address, publicClient, minWei, label) {
  for (let i = 0; i < 30; i++) {
    try {
      const bal = await getEvmBalanceWei(address, publicClient);
      console.log(`    ${label}: ${bal} wei`);
      if (bal >= minWei) return bal;
    } catch (e) {
      console.log(`    ${label}: RPC poll failed (${e.shortMessage ?? e.message})`);
    }
    await sleep(4000);
  }
  try {
    return await getEvmBalanceWei(address, publicClient);
  } catch {
    return 0n;
  }
}

function printHelp() {
  console.log(`HyperEVM testnet bootstrap (CLI)

Steps:
  1. claimDrip (testnet USDC) — requires same address on Hyperliquid mainnet once
  2. Market-buy HYPE on spot (@1035) if spot HYPE is low
  3. spotSend HYPE → HyperEVM system address (0x2222…)
  4. evmUserModify { usingBigBlocks: true }

Env / files:
  .env.testnet     PRIVATE_KEY + ADDRESS (from testnet-wallet.sh)
  BRIDGE_HYPE_AMOUNT   HYPE to bridge (default 0.5)
  MIN_EVM_HYPE_WEI     min EVM balance before skip-bridge (default 0.1 HYPE)

Flags:
  --skip-drip          skip faucet
  --skip-buy           skip spot HYPE purchase
  --skip-bridge        skip spotSend to EVM
  --skip-big-blocks    skip evmUserModify
  --bridge-amount N    HYPE amount to bridge

Then deploy:
  ./scripts/deploy-testnet.sh
  # or one-shot: ./scripts/testnet-init.sh --deploy
`);
}

async function main() {
  const { flags, opts } = parseArgs(process.argv.slice(2));
  if (flags.has("help")) {
    printHelp();
    return;
  }

  const { privateKey, address: envAddress } = resolveWalletEnv();
  if (!privateKey) {
    console.error("ERROR: Set MAIN_PRIVATE_KEY or PRIVATE_KEY in .env.testnet");
    process.exit(1);
  }

  const { privateKeyToAccount } = await viemImport("accounts/index.js");
  const { createPublicClient, http, formatEther } = await viemImport("index.js");

  const wallet = privateKeyToAccount(privateKey);
  const address = wallet.address;
  console.log("==> HyperEVM testnet bootstrap");
  console.log(`    Wallet: ${address}`);
  if (envAddress && envAddress.toLowerCase() !== address.toLowerCase()) {
    console.warn(`    ⚠ MAIN_ADDRESS (${envAddress}) != derived (${address}) — using derived key address`);
  }

  const { HttpTransport } = await hlImport("transport/http/mod.js");
  const { spotSend, evmUserModify, order } = await hlImport("api/exchange/mod.js");

  const transport = new HttpTransport({ isTestnet: true });
  const config = { transport, wallet };
  const publicClient = createPublicClient({
    transport: http(EVM_RPC),
  });

  let evmBal = 0n;
  try {
    evmBal = await getEvmBalanceWei(address, publicClient);
    console.log(`    EVM HYPE: ${formatEther(evmBal)}`);
  } catch (e) {
    console.log(`    ⚠ EVM RPC unreachable (${EVM_RPC}) — continuing HL steps only`);
    console.log(`      ${e.shortMessage ?? e.message ?? e}`);
  }

  // --- 1. claimDrip ---
  if (!flags.has("skipDrip") && evmBal < MIN_EVM_WEI) {
    console.log("\n[1/4] claimDrip (testnet USDC faucet)...");
    const drip = await postInfo({ type: "claimDrip", user: address });
    if (typeof drip === "string" && drip.toLowerCase().includes("cannot claim")) {
      console.log("    ⚠ Faucet blocked:", drip);
      console.log("");
      console.log("    Mainnet activation required (one-time):");
      console.log("    1. Use the SAME address on https://app.hyperliquid.xyz");
      console.log("    2. Deposit ≥ $5 USDC once to activate the address");
      console.log("    3. Re-run: ./scripts/testnet-init.sh");
      console.log("");
      console.log("    Or fund manually: bridge HYPE to HyperEVM, then:");
      console.log("      ./scripts/testnet-init.sh --skip-drip --skip-buy");
      if (evmBal < MIN_EVM_WEI) process.exit(2);
    } else {
      console.log("    ✓", typeof drip === "string" ? drip : JSON.stringify(drip));
      await sleep(3000);
    }
  } else {
    console.log("\n[1/4] claimDrip — skipped");
  }

  let spot = await getSpotBalances(address);
  console.log(`    Spot USDC: ${spot.USDC ?? "0"}, HYPE: ${spot.HYPE ?? "0"}`);

  // --- 2. Buy HYPE on spot ---
  if (!flags.has("skipBuy") && evmBal < MIN_EVM_WEI) {
    const hypeSpot = Number(spot.HYPE ?? "0");
    const bridgeNeed = Number(opts.bridgeAmount);
    if (hypeSpot < bridgeNeed + 0.01) {
      const usdc = Number(spot.USDC ?? "0");
      if (usdc < 5) {
        console.log("\n[2/4] Buy HYPE — insufficient USDC on spot");
        console.log("    Need testnet USDC (claimDrip or transfer). Current:", usdc);
        if (evmBal < MIN_EVM_WEI) process.exit(2);
      } else {
        console.log("\n[2/4] Market-buy HYPE on spot (pair @1035)...");
        const mid = await getMid(HYPE_SPOT_PAIR);
        const buySize = Math.max(bridgeNeed + 0.05, 0.1).toFixed(2);
        const limitPx = (mid * 1.08).toFixed(1);
        console.log(`    mid=${mid}, buy ${buySize} HYPE @ up to ${limitPx}`);

        try {
          const result = await order(config, {
            orders: [
              {
                a: HYPE_SPOT_ASSET_ID,
                b: true,
                p: limitPx,
                s: buySize,
                r: false,
                t: { limit: { tif: "FrontendMarket" } },
              },
            ],
            grouping: "na",
          });
          console.log("    ✓ order:", JSON.stringify(result.response?.data?.statuses ?? result));
          await sleep(2000);
          spot = await getSpotBalances(address);
          console.log(`    Spot HYPE now: ${spot.HYPE ?? "0"}`);
        } catch (e) {
          console.error("    ✗ order failed:", e.message ?? e);
          if (evmBal < MIN_EVM_WEI) process.exit(2);
        }
      }
    } else {
      console.log("\n[2/4] Buy HYPE — already enough spot HYPE");
    }
  } else {
    console.log("\n[2/4] Buy HYPE — skipped");
  }

  // --- 3. Bridge HYPE to HyperEVM ---
  let bridgeSent = false;
  if (!flags.has("skipBridge") && evmBal < MIN_EVM_WEI) {
    spot = await getSpotBalances(address);
    const hypeAvail = Number(spot.HYPE ?? "0");
    const amount = opts.bridgeAmount;

    if (hypeAvail < Number(amount)) {
      console.log(`\n[3/4] Bridge — need ${amount} HYPE on spot, have ${hypeAvail}`);
      if (evmBal < MIN_EVM_WEI) process.exit(2);
    } else {
      console.log(`\n[3/4] spotSend ${amount} HYPE → HyperEVM (${HYPE_SYSTEM})...`);
      const token = `HYPE:${HYPE_TOKEN_ID}`;
      try {
        await spotSend(config, {
          destination: HYPE_SYSTEM,
          token,
          amount: String(amount),
        });
        bridgeSent = true;
        console.log("    ✓ sent; waiting for EVM credit...");
        evmBal = await waitForEvmBalance(address, publicClient, MIN_EVM_WEI, "EVM HYPE");
        if (evmBal >= MIN_EVM_WEI) {
          console.log(`    EVM HYPE: ${formatEther(evmBal)}`);
        } else {
          console.log("    ⚠ EVM balance not confirmed (RPC issue?) — continuing if spotSend succeeded");
        }
      } catch (e) {
        console.error("    ✗ spotSend failed:", e.message ?? e);
        process.exit(2);
      }
    }
  } else {
    console.log("\n[3/4] Bridge — skipped");
    try {
      evmBal = await getEvmBalanceWei(address, publicClient);
    } catch {
      /* RPC optional at end */
    }
  }

  if (evmBal < MIN_EVM_WEI && !flags.has("skipBridge") && !bridgeSent) {
    console.error(`\nERROR: EVM HYPE still below minimum (${MIN_EVM_WEI} wei).`);
    console.error("Fund this address on HyperEVM or complete drip + bridge steps.");
    process.exit(2);
  }

  // --- 4. Big blocks ---
  if (!flags.has("skipBigBlocks")) {
    console.log("\n[4/4] evmUserModify { usingBigBlocks: true }...");
    try {
      await evmUserModify(config, { usingBigBlocks: true });
      console.log("    ✓ big blocks enabled");
    } catch (e) {
      const msg = e.message ?? String(e);
      if (/already|unchanged/i.test(msg)) {
        console.log("    ✓ big blocks already set");
      } else {
        console.error("    ✗ evmUserModify failed:", msg);
        console.error("    Retry manually or: node scripts/testnet-bootstrap.mjs --skip-drip --skip-buy --skip-bridge");
        process.exit(2);
      }
    }
  } else {
    console.log("\n[4/4] Big blocks — skipped");
  }

  console.log("\n==> Bootstrap complete");
  console.log(`    Deployer: ${address}`);
  if (evmBal > 0n) console.log(`    EVM HYPE: ${formatEther(evmBal)}`);
  console.log("");
  console.log("Deploy contracts:");
  console.log("  export PRIVATE_KEY=$(grep PRIVATE_KEY .env.testnet | cut -d= -f2)");
  console.log("  ./scripts/deploy-testnet.sh");
  console.log("  # or: ./scripts/testnet-init.sh --deploy");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
