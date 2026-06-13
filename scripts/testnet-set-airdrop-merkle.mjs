#!/usr/bin/env node
/** Update Merkle root + deployment JSON for testnet cashdrop claim amount. */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const CLAIM_USDC = process.env.CLAIM_USDC ?? "2";

function loadEnv() {
  for (const line of fs.readFileSync(path.join(root, ".env.testnet"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1);
  }
  let pk = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (pk && !pk.startsWith("0x")) pk = `0x${pk}`;
  process.env.PRIVATE_KEY = pk;
}

function makeLeaf(address, amount, v) {
  const inner = v.keccak256(
    v.encodeAbiParameters(
      [{ name: "account", type: "address" }, { name: "amount", type: "uint256" }],
      [v.getAddress(address), amount]
    )
  );
  return v.keccak256(v.concat([inner]));
}

loadEnv();
const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href);
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8"));
const amount = viem.parseUnits(CLAIM_USDC, 6);
const merkleRoot = makeLeaf(account.address, amount, viem);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 90 * 86400);
const chain = { id: 998, name: "HyperEVM Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });
const abi = JSON.parse(fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"), "utf8"));
const h = await walletClient.writeContract({ address: deployment.airdrop, abi, functionName: "setMerkleRoot", args: [merkleRoot, deadline] });
await publicClient.waitForTransactionReceipt({ hash: h });
deployment.airdropEntries = [{ address: account.address, amount: amount.toString() }];
deployment.merkleRoot = merkleRoot;
for (const p of [path.join(root, "contracts/deployments/998.json"), path.join(root, "frontend/src/lib/contracts/deployments/998.json")]) {
  fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
}
console.log(`Merkle root updated — claim ${CLAIM_USDC} USDC for ${account.address}`);
