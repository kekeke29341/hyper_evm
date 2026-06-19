#!/usr/bin/env node
/**
 * Merge ReferralRegistry address from broadcast into deployment JSON.
 * Usage: node scripts/finalize-referral.mjs <chainId> [rpcUrl]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const chainId = Number(process.argv[2]);
const rpcInput = process.argv[3];

if (!chainId) {
  console.error("Usage: node scripts/finalize-referral.mjs <chainId> [rpcUrl]");
  process.exit(1);
}

const RPC_ALIASES = {
  hyperEVM_mainnet: "https://rpc.hyperliquid.xyz/evm",
  hyperEVM_testnet: "https://rpc.hyperliquid-testnet.xyz/evm",
  hyperEVM_testnet_alt: "https://rpcs.chain.link/hyperevm/testnet",
  anvil: "http://127.0.0.1:8545",
};

function resolveRpcUrl(urlOrAlias) {
  if (!urlOrAlias) return null;
  if (urlOrAlias.startsWith("http://") || urlOrAlias.startsWith("https://")) return urlOrAlias;
  return RPC_ALIASES[urlOrAlias] ?? null;
}

const rpcUrl = resolveRpcUrl(rpcInput);

function findReferralAddress() {
  const dir = path.join(root, "contracts/broadcast/DeployReferral.s.sol", String(chainId));
  if (!fs.existsSync(dir)) throw new Error(`No broadcast dir for chain ${chainId}`);

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json") && !f.includes("dry-run"))
    .map((f) => path.join(dir, f))
    .sort()
    .reverse();

  for (const file of files) {
    const run = JSON.parse(fs.readFileSync(file, "utf8"));
    const creates = (run.transactions ?? []).filter(
      (t) => t.contractName === "ReferralRegistry" && t.transactionType === "CREATE" && t.contractAddress
    );
    if (creates.length > 0) {
      console.log(`Using broadcast: ${file}`);
      return creates[creates.length - 1].contractAddress;
    }
  }

  throw new Error("ReferralRegistry CREATE not found in broadcast files");
}

async function hasCode(address) {
  if (!rpcUrl) return true;
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "eth_getCode failed");
  return json.result && json.result !== "0x";
}

const referralRegistry = findReferralAddress();
if (rpcUrl && !(await hasCode(referralRegistry))) {
  throw new Error(`ReferralRegistry has no bytecode at ${referralRegistry}`);
}

const paths = [
  path.join(root, "contracts/deployments", `${chainId}.json`),
  path.join(root, "frontend/src/lib/contracts/deployments", `${chainId}.json`),
];

for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.warn(`Skip missing deployment file: ${p}`);
    continue;
  }
  const deployment = JSON.parse(fs.readFileSync(p, "utf8"));
  deployment.referralRegistry = referralRegistry;
  fs.writeFileSync(p, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`Updated ${p}`);
}

console.log(`ReferralRegistry: ${referralRegistry}`);
