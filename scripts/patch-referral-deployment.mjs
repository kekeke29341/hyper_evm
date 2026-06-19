#!/usr/bin/env node
/**
 * Add referralRegistry from latest DeployReferralRegistry broadcast to deployment JSON.
 * Preserves existing vault/airdrop entries (vaultShareHolders, airdropEntries, merkleRoot).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const chainId = Number(process.argv[2] ?? "998");
const rpcInput = process.argv[3] ?? "https://rpcs.chain.link/hyperevm/testnet";

const RPC_ALIASES = {
  hyperEVM_testnet: "https://rpc.hyperliquid-testnet.xyz/evm",
  hyperEVM_testnet_alt: "https://rpcs.chain.link/hyperevm/testnet",
};

function resolveRpc(urlOrAlias) {
  if (urlOrAlias.startsWith("http")) return urlOrAlias;
  return RPC_ALIASES[urlOrAlias] ?? urlOrAlias;
}

const rpcUrl = resolveRpc(rpcInput);

function findReferralFromBroadcast() {
  const dir = path.join(root, "contracts/broadcast/DeployReferralRegistry.s.sol", String(chainId));
  if (!fs.existsSync(dir)) throw new Error(`No broadcast dir: ${dir}`);

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json") && !f.includes("dry-run"))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const file of files) {
    const run = JSON.parse(fs.readFileSync(file, "utf8"));
    const txs = run.transactions ?? [];
    const creates = txs.filter(
      (t) => t.contractName === "ReferralRegistry" && t.transactionType === "CREATE" && t.contractAddress
    );
    if (creates.length) {
      console.log(`Using broadcast: ${file}`);
      return creates[creates.length - 1].contractAddress;
    }
  }
  throw new Error("ReferralRegistry CREATE not found in broadcast files");
}

async function hasCode(address) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result && json.result !== "0x";
}

const referralRegistry =
  process.env.REFERRAL_REGISTRY ??
  (process.argv[4] && process.argv[4].startsWith("0x") ? process.argv[4] : null) ??
  findReferralFromBroadcast();
if (!(await hasCode(referralRegistry))) {
  throw new Error(`ReferralRegistry has no code at ${referralRegistry}`);
}

for (const rel of [
  path.join(root, "contracts/deployments", `${chainId}.json`),
  path.join(root, "frontend/src/lib/contracts/deployments", `${chainId}.json`),
]) {
  let deployment = {};
  if (fs.existsSync(rel)) {
    deployment = JSON.parse(fs.readFileSync(rel, "utf8"));
  } else {
    deployment = { chainId, deployed: true };
  }
  deployment.referralRegistry = referralRegistry;
  fs.mkdirSync(path.dirname(rel), { recursive: true });
  fs.writeFileSync(rel, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`Updated ${rel}`);
}

console.log(`referralRegistry: ${referralRegistry}`);
