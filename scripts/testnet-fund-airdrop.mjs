#!/usr/bin/env node
/** Fund MerkleAirdrop after LP — bridges USDC if needed. */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const USDC_SYSTEM = "0x2000000000000000000000000000000000000000";
const USDC_TOKEN = "USDC:0xeb62eee3685fc4c43992febcd9e75443";
const FUND_USDC = process.env.FUND_USDC ?? "100";

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

loadEnv();
const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href);
const { HttpTransport } = await import(pathToFileURL(path.join(root, "frontend/node_modules/@nktkas/hyperliquid/esm/transport/http/mod.js")).href);
const { spotSend } = await import(pathToFileURL(path.join(root, "frontend/node_modules/@nktkas/hyperliquid/esm/api/exchange/mod.js")).href);

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8"));
const chain = { id: 998, name: "HyperEVM Testnet", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });
const erc20 = [{ name: "approve", type: "function", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }, { name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }];
const fundAmount = viem.parseUnits(FUND_USDC, 6);

let bal = await publicClient.readContract({ address: deployment.tokenUSDC, abi: erc20, functionName: "balanceOf", args: [account.address] });
if (bal < fundAmount) {
  const need = (Number(FUND_USDC) - Number(bal) / 1e6 + 1).toFixed(0);
  console.log(`Bridge ${need} USDC from spot...`);
  await spotSend({ transport: new HttpTransport({ isTestnet: true }), wallet: account }, { destination: USDC_SYSTEM, token: USDC_TOKEN, amount: need });
  await new Promise((r) => setTimeout(r, 10000));
  bal = await publicClient.readContract({ address: deployment.tokenUSDC, abi: erc20, functionName: "balanceOf", args: [account.address] });
}

const amount = bal < fundAmount ? bal : fundAmount;
console.log(`Funding airdrop with ${amount} wei USDC`);
const airdropAbi = JSON.parse(fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"), "utf8"));
const h1 = await walletClient.writeContract({ address: deployment.tokenUSDC, abi: erc20, functionName: "approve", args: [deployment.airdrop, amount] });
await publicClient.waitForTransactionReceipt({ hash: h1 });
const h2 = await walletClient.writeContract({ address: deployment.airdrop, abi: airdropAbi, functionName: "fund", args: [amount] });
await publicClient.waitForTransactionReceipt({ hash: h2 });
console.log("Done.");
