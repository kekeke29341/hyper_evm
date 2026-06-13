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
    tokenUSDC: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
  },
};

const REQUIRED = {
  feeCollector: "FeeCollector",
  referralRegistry: "ReferralRegistry",
  pointsDistributor: "PointsDistributor",
  oracle: "HyperCoreOracle",
  factory: "ProjectXFactory",
  router: "ProjectXRouter",
  airdrop: "MerkleAirdrop",
  liquidityVault: "HyperpoolLiquidityVault",
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
    path.join(root, "contracts/broadcast/DeployProjectX.s.sol", String(chainId)),
    path.join(root, "contracts/broadcast/DeployVaultOnlyTestnet.s.sol", String(chainId)),
    path.join(root, "contracts/broadcast/ContinuePhase3Testnet.s.sol", String(chainId)),
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

function findPairAddress(txs) {
  for (const tx of txs) {
    const found = (tx.additionalContracts ?? []).find((c) => c.contractName === "ProjectXPair");
    if (found?.address) return found.address;
  }
  return null;
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
  const code = await rpc("eth_getCode", [address, "latest"]);
  return code && code !== "0x";
}

async function requireCode(label, address) {
  if (!(await hasCode(address))) {
    throw new Error(`${label} has no on-chain code at ${address}`);
  }
}

async function buildDeploymentFromTxs(txs) {
  const partial = {
    feeCollector: findCreateAddress(txs, REQUIRED.feeCollector),
    referralRegistry: findCreateAddress(txs, REQUIRED.referralRegistry),
    pointsDistributor: findCreateAddress(txs, REQUIRED.pointsDistributor),
    oracle: findCreateAddress(txs, REQUIRED.oracle),
    factory: findCreateAddress(txs, REQUIRED.factory),
    router: findCreateAddress(txs, REQUIRED.router),
    airdrop: findCreateAddress(txs, REQUIRED.airdrop),
    pair: findPairAddress(txs),
    liquidityVault: findCreateAddress(txs, REQUIRED.liquidityVault),
  };

  for (const [label, address] of Object.entries(partial)) {
    if (!address) return null;
    if (!(await hasCode(address))) return null;
  }

  return {
    chainId,
    deployed: true,
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

  // Vault-only / continuation scripts: merge vault into best partial DeployProjectX run.
  for (const entry of ranked) {
    const base = await buildDeploymentFromTxs(entry.run.transactions ?? []);
    if (base) continue;
    const txs = entry.run.transactions ?? [];
    const vault = findCreateAddress(txs, REQUIRED.liquidityVault);
    if (!vault || !(await hasCode(vault))) continue;

    for (const projectEntry of ranked) {
      if (!projectEntry.file.includes("DeployProjectX.s.sol")) continue;
      const projectTxs = projectEntry.run.transactions ?? [];
      const core = {
        feeCollector: findCreateAddress(projectTxs, REQUIRED.feeCollector),
        referralRegistry: findCreateAddress(projectTxs, REQUIRED.referralRegistry),
        pointsDistributor: findCreateAddress(projectTxs, REQUIRED.pointsDistributor),
        oracle: findCreateAddress(projectTxs, REQUIRED.oracle),
        factory: findCreateAddress(projectTxs, REQUIRED.factory),
        router: findCreateAddress(projectTxs, REQUIRED.router),
        airdrop: findCreateAddress(projectTxs, REQUIRED.airdrop),
        pair: findPairAddress(projectTxs),
      };
      if (Object.values(core).some((a) => !a)) continue;
      const merged = {
        chainId,
        deployed: true,
        ...core,
        liquidityVault: vault,
        tokenKHYPE: CHAIN_TOKENS[chainId].tokenKHYPE,
        tokenUSDC: CHAIN_TOKENS[chainId].tokenUSDC,
      };
      const labels = ["feeCollector", "referralRegistry", "pointsDistributor", "oracle", "factory", "router", "airdrop", "pair", "liquidityVault"];
      let mergedOk = true;
      for (const label of labels) {
        if (!(await hasCode(merged[label]))) mergedOk = false;
      }
      if (mergedOk) {
        console.log(`Using merged deployment: core from ${projectEntry.file} + vault from ${entry.file}`);
        return merged;
      }
    }
  }

  throw new Error("No complete on-chain deployment found in broadcast files");
}

const deployment = await findBestDeployment(
  broadcastArg && fs.existsSync(broadcastArg) ? broadcastArg : undefined
);

for (const [label, address] of Object.entries(deployment)) {
  if (label === "chainId" || label === "deployed" || label.startsWith("token")) continue;
  await requireCode(label, address);
}

const outPath = path.join(root, "contracts/deployments", `${chainId}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Finalized deployment: ${outPath}`);
