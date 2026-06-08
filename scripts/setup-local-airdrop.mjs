#!/usr/bin/env node
/**
 * Seed local MerkleAirdrop after DeployLocal.
 * Usage: node scripts/setup-local-airdrop.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const deployPath = path.join(root, "contracts/deployments/31337.json");

const viemRoot = path.join(root, "frontend/node_modules/viem");
const { createWalletClient, createPublicClient, http, parseUnits, keccak256, encodeAbiParameters, concat, getAddress } =
  await import(pathToFileURL(path.join(viemRoot, "_esm/index.js")).href);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(viemRoot, "_esm/accounts/index.js")).href
);
const { anvil } = await import(pathToFileURL(path.join(viemRoot, "_esm/chains/index.js")).href);

function makeLeaf(address, amount) {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { name: "account", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      [getAddress(address), amount]
    )
  );
  return keccak256(concat([inner]));
}

function sortPair(a, b) {
  return a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
}

function hashPair(a, b) {
  const [x, y] = sortPair(a, b);
  return keccak256(concat([x, y]));
}

function buildMerkleRoot(entries) {
  let layer = entries.map((e) => makeLeaf(e.address, e.amount));
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) next.push(hashPair(layer[i], layer[i + 1]));
      else next.push(layer[i]);
    }
    layer = next;
  }
  return layer[0];
}

const ENTRIES = [
  { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", amount: 1000000000n },
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: 500000000n },
  { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", amount: 250000000n },
];

const DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";

if (!fs.existsSync(deployPath)) {
  console.error("Missing deployment file. Run DeployLocal first.");
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(deployPath, "utf8"));
const account = privateKeyToAccount(DEPLOYER_KEY);
const publicClient = createPublicClient({ chain: anvil, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: anvil, transport: http(RPC) });

const merkleRoot = buildMerkleRoot(ENTRIES);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 90 * 86400);
const fundAmount = parseUnits("5000", 6);

const airdropAbi = JSON.parse(
  fs.readFileSync(
    path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"),
    "utf8"
  )
);
const erc20Abi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MockERC20.json"), "utf8")
);

async function send(contract, abi, fn, args) {
  const hash = await walletClient.writeContract({ address: contract, abi, functionName: fn, args });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ${fn} ok`);
}

console.log("==> Setting Merkle root:", merkleRoot);
await send(deployment.airdrop, airdropAbi, "setMerkleRoot", [merkleRoot, deadline]);

console.log("==> Funding airdrop with 5000 USDC");
await send(deployment.tokenUSDC, erc20Abi, "approve", [deployment.airdrop, fundAmount]);
await send(deployment.airdrop, airdropAbi, "fund", [fundAmount]);

deployment.airdropEntries = ENTRIES.map((e) => ({
  address: e.address,
  amount: e.amount.toString(),
}));

fs.writeFileSync(deployPath, JSON.stringify(deployment, null, 2) + "\n");
const feDeploy = path.join(root, "frontend/src/lib/contracts/deployments/31337.json");
fs.writeFileSync(feDeploy, JSON.stringify(deployment, null, 2) + "\n");

console.log("==> Airdrop ready. Claimable accounts: Anvil #0–#2");
console.log("Done.");
