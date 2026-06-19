#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  process.exit(1);
}

const chainId = Number(process.argv[2]);
const rpcInput = process.argv[3];
const broadcastArg = process.argv[4];

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
    projectXPool:
      chainId === 999 ? "0x6c9A33E3b592C0d65B3Ba59355d5Be0d38259285" : undefined,
    ...partial,
    tokenKHYPE: CHAIN_TOKENS[chainId].tokenKHYPE,
    tokenUSDC: CHAIN_TOKENS[chainId].tokenUSDC,
  };
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

const deployment = await findBestDeployment(
  broadcastArg && fs.existsSync(broadcastArg) ? broadcastArg : undefined
);

for (const [label, address] of Object.entries(deployment)) {
  if (label === "chainId" || label === "deployed" || label.startsWith("token") || address === undefined) continue;
  await requireCode(label, address);
}

const outPath = path.join(root, "contracts/deployments", `${chainId}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const cleaned = Object.fromEntries(Object.entries(deployment).filter(([, v]) => v !== undefined));
fs.writeFileSync(outPath, `${JSON.stringify(cleaned, null, 2)}\n`);
console.log(`Finalized deployment: ${outPath}`);
