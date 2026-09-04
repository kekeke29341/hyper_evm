#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { upsertPoolPreservingTopLevel } from "./lib/pool-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const CHAIN_TOKENS = {
  998: {
    tokenKHYPE: "0x5555555555555555555555555555555555555555",
    tokenUSDC: "0x2B3370eE501B4a559b57D449569354196457D8Ab",
  },
  999: {
    tokenKHYPE: "0x5555555555555555555555555555555555555555",
    tokenUSDC: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    projectXNpm: "0xeaD19AE861c29bBb2101E834922B2FEee69B9091",
    projectXPool: "0x422e586C906eb241f784B4F5a633c2C7e59A2F54",
    swapRouter: "0x1EbDFC75FfE3ba3de61E7138a3E8706aC841Af9B",
  },
};

const CORE_CONTRACTS = {
  oracle: "HyperCoreOracle",
  projectXAdapter: "ProjectXAdapter",
  hyperpoolVault: "HyperpoolVault",
  airdrop: "MerkleAirdrop",
};

const OPTIONAL_CONTRACTS = {
  projectXNpm: "MockProjectXNPM",
  referralRegistry: "ReferralRegistry",
};

function usage() {
  console.error("Usage: node scripts/finalize-deployment.mjs <chainId> <rpcUrl> [broadcastJson]");
  console.error("       node scripts/finalize-deployment.mjs <chainId> <rpcUrl> --pair <key> [broadcastJson]");
  console.error("  --pair upserts a HYPE-quoted pool into pools[] using env metadata (POOL_KEY/LABEL/");
  console.error("  BASE_TOKEN/QUOTE_TOKEN/POOL/UPPER_RANGE_BPS/LOWER_RANGE_BPS/TWAP_WINDOW/REWARD_TOKEN).");
  console.error("  It never overwrites top-level (legacy HYPE/USDC) fields.");
  process.exit(1);
}

const chainId = Number(process.argv[2]);
const rpcInput = process.argv[3];

// Parse optional --pair <key> anywhere after the rpc arg.
let pairKey = null;
const restArgs = process.argv.slice(4);
const pairIdx = restArgs.indexOf("--pair");
if (pairIdx !== -1) {
  pairKey = restArgs[pairIdx + 1];
  if (!pairKey) usage();
  restArgs.splice(pairIdx, 2);
}
const broadcastArg = restArgs[0];

const RPC_ALIASES = {
  hyperEVM_mainnet: "https://rpc.hyperliquid.xyz/evm",
  hyperEVM_testnet: "https://rpc.hyperliquid-testnet.xyz/evm",
  hyperEVM_testnet_alt: "https://rpcs.chain.link/hyperevm/testnet",
  anvil: "http://127.0.0.1:8545",
};

function resolveRpcUrl(urlOrAlias) {
  if (!urlOrAlias) return urlOrAlias;
  if (urlOrAlias.startsWith("http://") || urlOrAlias.startsWith("https://")) return urlOrAlias;
  const resolved = RPC_ALIASES[urlOrAlias];
  if (!resolved) throw new Error(`Unknown RPC alias: ${urlOrAlias}`);
  return resolved;
}

const rpcUrl = resolveRpcUrl(rpcInput);

if (!chainId || !rpcInput) usage();
if (!CHAIN_TOKENS[chainId]) throw new Error(`Unsupported chain id: ${chainId}`);

function listBroadcastFiles(chainId) {
  const dirs = [
    path.join(root, "contracts/broadcast/DeployHyperpool.s.sol", String(chainId)),
    path.join(root, "contracts/broadcast/DeployLocal.s.sol", String(chainId)),
  ];

  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith("run-") && f.endsWith(".json") && !f.includes("dry-run")) {
        files.push(path.join(dir, f));
      }
    }
  }

  if (files.length === 0) throw new Error(`No broadcast run files for chain ${chainId}`);
  return files;
}

function runScore(run, filePath) {
  const receipts = Array.isArray(run.receipts) ? run.receipts.length : 0;
  const timestamp = Number(run.timestamp ?? 0);
  const latestBonus = filePath.endsWith("run-latest.json") ? 1_000_000 : 0;
  return receipts * 10_000 + timestamp + latestBonus;
}

function findCreateAddress(txs, name) {
  const creates = txs.filter((t) => t.contractName === name && t.transactionType === "CREATE");
  if (creates.length === 0) return null;
  const withHash = creates.find((t) => t.hash && t.contractAddress);
  return (withHash ?? creates[creates.length - 1]).contractAddress ?? null;
}

async function rpc(method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method} failed: ${json.error.message ?? JSON.stringify(json.error)}`);
  return json.result;
}

async function hasCode(address) {
  if (!address) return false;
  const code = await rpc("eth_getCode", [address, "latest"]);
  return code && code !== "0x";
}

async function requireCode(label, address) {
  if (!(await hasCode(address))) {
    throw new Error(`${label} has no on-chain code at ${address}`);
  }
}

async function buildDeploymentFromTxs(txs) {
  const partial = {};
  for (const [key, name] of Object.entries(CORE_CONTRACTS)) {
    partial[key] = findCreateAddress(txs, name);
    if (!partial[key] || !(await hasCode(partial[key]))) return null;
  }

  for (const [key, name] of Object.entries(OPTIONAL_CONTRACTS)) {
    const addr = findCreateAddress(txs, name);
    if (addr && (await hasCode(addr))) partial[key] = addr;
  }

  const vault = partial.hyperpoolVault;
  return {
    chainId,
    deployed: true,
    hyperpoolVault: vault,
    liquidityVault: vault,
    ...partial,
    projectXNpm: CHAIN_TOKENS[chainId].projectXNpm ?? partial.projectXNpm,
    projectXPool: CHAIN_TOKENS[chainId].projectXPool,
    swapRouter: CHAIN_TOKENS[chainId].swapRouter,
    tokenKHYPE: CHAIN_TOKENS[chainId].tokenKHYPE,
    tokenUSDC: CHAIN_TOKENS[chainId].tokenUSDC,
  };
}

// ---------------------------------------------------------------------------
// --pair mode: upsert one HYPE-quoted pool into pools[] without touching the
// top-level (legacy HYPE/USDC) fields. Addresses come from the
// DeployHyperpoolPair broadcast; metadata comes from env (same vars used at
// deploy time). Decimals/symbols are read on-chain so the operator can't skew them.
// ---------------------------------------------------------------------------

const WHYPE_DEFAULT = "0x5555555555555555555555555555555555555555";

function listPairBroadcastFiles(chainId) {
  const dir = path.join(root, "contracts/broadcast/DeployHyperpoolPair.s.sol", String(chainId));
  if (!fs.existsSync(dir)) throw new Error(`No DeployHyperpoolPair broadcast dir for chain ${chainId}: ${dir}`);
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("run-") && f.endsWith(".json") && !f.includes("dry-run")) {
      files.push(path.join(dir, f));
    }
  }
  if (files.length === 0) throw new Error(`No DeployHyperpoolPair broadcast run files for chain ${chainId}`);
  return files;
}

function pickPairRun(explicitPath) {
  const files = explicitPath ? [explicitPath] : listPairBroadcastFiles(chainId);
  const ranked = files
    .map((file) => {
      try {
        return { file, run: JSON.parse(fs.readFileSync(file, "utf8")) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .map((e) => ({ ...e, score: runScore(e.run, e.file) }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) throw new Error("No readable DeployHyperpoolPair broadcast run files");
  return ranked[0];
}

function receiptBlockFor(run, address) {
  const receipts = Array.isArray(run.receipts) ? run.receipts : [];
  const lower = address.toLowerCase();
  const r = receipts.find((x) => (x.contractAddress ?? "").toLowerCase() === lower);
  if (r && r.blockNumber) return Number(BigInt(r.blockNumber)).toString();
  return null;
}

async function ethCall(to, data) {
  return rpc("eth_call", [{ to, data }, "latest"]);
}

async function erc20Decimals(address) {
  const res = await ethCall(address, "0x313ce567"); // decimals()
  if (!res || res === "0x") throw new Error(`decimals() empty for ${address}`);
  return Number(BigInt(res));
}

function decodeAbiString(hex) {
  // Standard ABI-encoded string: [offset][length][data...]. Falls back to bytes32.
  if (!hex || hex === "0x") return "";
  const body = hex.slice(2);
  if (body.length < 128) {
    // Non-standard bytes32 symbol: trim trailing zero bytes.
    const bytes = body.replace(/(00)+$/, "");
    return Buffer.from(bytes, "hex").toString("utf8").replace(/\0/g, "");
  }
  const len = Number(BigInt("0x" + body.slice(64, 128)));
  const data = body.slice(128, 128 + len * 2);
  return Buffer.from(data, "hex").toString("utf8");
}

async function erc20Symbol(address) {
  try {
    const res = await ethCall(address, "0x95d89b41"); // symbol()
    return decodeAbiString(res);
  } catch {
    return "";
  }
}

async function runPairMode(explicitPath) {
  const outPath = path.join(root, "contracts/deployments", `${chainId}.json`);
  if (!fs.existsSync(outPath)) {
    throw new Error(`--pair requires an existing ${outPath} to upsert into (top-level must be preserved)`);
  }

  const picked = pickPairRun(explicitPath && fs.existsSync(explicitPath) ? explicitPath : undefined);
  console.log(`Using pair broadcast: ${picked.file} (score=${picked.score})`);
  const txs = picked.run.transactions ?? [];

  const adapter = findCreateAddress(txs, "ProjectXAdapter");
  const vault = findCreateAddress(txs, "HyperpoolVault");
  const airdrop = findCreateAddress(txs, "MerkleAirdrop");
  if (!adapter || !vault || !airdrop) {
    throw new Error(
      `pair broadcast missing addresses (adapter=${adapter}, vault=${vault}, airdrop=${airdrop})`
    );
  }
  await requireCode("ProjectXAdapter", adapter);
  await requireCode("HyperpoolVault", vault);
  await requireCode("MerkleAirdrop", airdrop);

  const baseToken = process.env.BASE_TOKEN;
  const pool = process.env.POOL;
  if (!baseToken) throw new Error("--pair needs BASE_TOKEN in env (same as deploy)");
  if (!pool) throw new Error("--pair needs POOL in env (same as deploy)");
  const quoteToken = process.env.QUOTE_TOKEN || WHYPE_DEFAULT;
  const rewardToken = process.env.REWARD_TOKEN || quoteToken;
  const upperRangeBps = Number(process.env.UPPER_RANGE_BPS ?? "500");
  const lowerRangeBps = Number(process.env.LOWER_RANGE_BPS ?? "500");
  const twapWindow = Number(process.env.TWAP_WINDOW ?? "900");

  await requireCode("BASE_TOKEN", baseToken);
  await requireCode("QUOTE_TOKEN", quoteToken);
  await requireCode("POOL", pool);

  const [baseDecimals, quoteDecimals, baseSymbol, quoteSymbol] = await Promise.all([
    erc20Decimals(baseToken),
    erc20Decimals(quoteToken),
    erc20Symbol(baseToken),
    erc20Symbol(quoteToken),
  ]);

  const entry = {
    key: pairKey,
    label: process.env.LABEL || `${baseSymbol}/${quoteSymbol === "WHYPE" ? "HYPE" : quoteSymbol}`,
    vault,
    adapter,
    airdrop,
    oracle: process.env.POOL_ORACLE || "0x0000000000000000000000000000000000000000",
    pool,
    quoteToken,
    quoteSymbol: quoteSymbol || "WHYPE",
    quoteDecimals,
    baseToken,
    baseSymbol,
    baseDecimals,
    rewardToken,
    upperRangeBps,
    lowerRangeBps,
    twapWindow,
    vaultDeployBlock: receiptBlockFor(picked.run, vault),
    cashdrop: {},
  };

  const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
  const hadPool = Array.isArray(existing.pools) && existing.pools.some((p) => p.key === pairKey);
  console.log(hadPool ? `Updating existing pool '${pairKey}' (cashdrop state preserved)` : `Inserting new pool '${pairKey}'`);

  // Keep the frontend's copy in step; daily-rewards writes both and would otherwise re-add pools[]
  // to one file only, leaving the two divergent until the first distribution.
  const targets = [outPath, path.join(root, "frontend/src/lib/contracts/deployments", `${chainId}.json`)];
  for (const p of targets) {
    if (!fs.existsSync(p)) continue;
    const before = JSON.parse(fs.readFileSync(p, "utf8"));
    fs.writeFileSync(p, `${JSON.stringify(upsertPoolPreservingTopLevel(before, entry), null, 2)}\n`);
    console.log(`Upserted pool '${pairKey}' into ${p}`);
  }
  console.log(JSON.stringify(entry, null, 2));
}

async function findBestDeployment(explicitPath) {
  const files = explicitPath ? [explicitPath] : listBroadcastFiles(chainId);
  const ranked = files
    .map((file) => {
      try {
        const run = JSON.parse(fs.readFileSync(file, "utf8"));
        return { file, run, score: runScore(run, file) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  for (const entry of ranked) {
    const deployment = await buildDeploymentFromTxs(entry.run.transactions ?? []);
    if (deployment) {
      console.log(`Using broadcast run: ${entry.file} (score=${entry.score})`);
      return deployment;
    }
  }

  throw new Error("No complete on-chain deployment found in broadcast files");
}

if (pairKey) {
  await runPairMode(broadcastArg);
} else {
  const deployment = await findBestDeployment(
    broadcastArg && fs.existsSync(broadcastArg) ? broadcastArg : undefined
  );

  for (const [label, address] of Object.entries(deployment)) {
    if (label === "chainId" || label === "deployed" || label.startsWith("token") || address === undefined) continue;
    await requireCode(label, address);
  }

  const outPath = path.join(root, "contracts/deployments", `${chainId}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // This mode rebuilds the file from a broadcast, so it would drop pools[] (and with it every
  // HYPE-quoted pool's accumulated Cashdrop state) on a chain that already has pools deployed.
  // Re-finalizing the legacy vault is a rare, deliberate act; make destroying pools[] deliberate too.
  if (fs.existsSync(outPath)) {
    const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
    if (Array.isArray(existing.pools) && existing.pools.length > 0 && process.env.ALLOW_POOLS_RESET !== "1") {
      throw new Error(
        `${outPath} already has ${existing.pools.length} pools[] entr(y|ies); a full finalize would erase them ` +
          `along with their Cashdrop state. Use --pair <key> to upsert one pool, or set ALLOW_POOLS_RESET=1 to override.`
      );
    }
  }
  const cleaned = Object.fromEntries(Object.entries(deployment).filter(([, v]) => v !== undefined));
  fs.writeFileSync(outPath, `${JSON.stringify(cleaned, null, 2)}\n`);
  console.log(`Finalized deployment: ${outPath}`);
}
