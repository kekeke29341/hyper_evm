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
const rpcUrl = process.argv[3];
const broadcastJson =
  process.argv[4] ?? path.join(root, "contracts/broadcast/DeployProjectX.s.sol", String(chainId), "run-latest.json");

if (!chainId || !rpcUrl) usage();
if (!CHAIN_TOKENS[chainId]) throw new Error(`Unsupported chain id: ${chainId}`);
if (!fs.existsSync(broadcastJson)) throw new Error(`Broadcast file not found: ${broadcastJson}`);

const run = JSON.parse(fs.readFileSync(broadcastJson, "utf8"));
const txs = Array.isArray(run.transactions) ? run.transactions : [];

function findContract(name) {
  const tx = txs.find((t) => t.contractName === name && t.transactionType === "CREATE");
  if (!tx?.hash) throw new Error(`Missing confirmed transaction hash for ${name}`);
  if (!tx.contractAddress) throw new Error(`Missing contract address for ${name}`);
  return tx.contractAddress;
}

function findPair() {
  for (const tx of txs) {
    if (!tx.hash) continue;
    const found = (tx.additionalContracts ?? []).find((c) => c.contractName === "ProjectXPair");
    if (found?.address) return found.address;
  }
  throw new Error("Missing ProjectXPair address in broadcast additionalContracts");
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

async function requireCode(label, address) {
  const code = await rpc("eth_getCode", [address, "latest"]);
  if (!code || code === "0x") throw new Error(`${label} has no code at ${address}`);
}

const deployment = {
  chainId,
  deployed: true,
  feeCollector: findContract(REQUIRED.feeCollector),
  referralRegistry: findContract(REQUIRED.referralRegistry),
  pointsDistributor: findContract(REQUIRED.pointsDistributor),
  oracle: findContract(REQUIRED.oracle),
  factory: findContract(REQUIRED.factory),
  router: findContract(REQUIRED.router),
  airdrop: findContract(REQUIRED.airdrop),
  pair: findPair(),
  liquidityVault: findContract(REQUIRED.liquidityVault),
  tokenKHYPE: CHAIN_TOKENS[chainId].tokenKHYPE,
  tokenUSDC: CHAIN_TOKENS[chainId].tokenUSDC,
};

for (const [label, address] of Object.entries(deployment)) {
  if (label === "chainId" || label === "deployed" || label.startsWith("token")) continue;
  await requireCode(label, address);
}

const outPath = path.join(root, "contracts/deployments", `${chainId}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Finalized deployment: ${outPath}`);
