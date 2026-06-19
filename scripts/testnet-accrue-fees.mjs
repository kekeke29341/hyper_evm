#!/usr/bin/env node
/**
 * Testnet only: accrue mock LP fees on MockProjectXNPM for harvest/daily-rewards testing.
 * Usage: source scripts/testnet-env.sh && node scripts/testnet-accrue-fees.mjs
 *
 * Env: FEE_USDC=1 (default 1 USDC in 6-dec), FEE_WHYPE=0
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const FEE_USDC = process.env.FEE_USDC ?? "1";
const FEE_WHYPE = process.env.FEE_WHYPE ?? "0";

function loadEnv() {
  const file = path.join(root, ".env.testnet");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
  let pk = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (pk && !pk.startsWith("0x")) pk = `0x${pk}`;
  process.env.PRIVATE_KEY = pk;
}

async function viemImport(sub) {
  return import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm", sub)).href);
}

async function main() {
  loadEnv();
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Set MAIN_PRIVATE_KEY in .env.testnet");

  const viem = await viemImport("index.js");
  const { privateKeyToAccount } = await viemImport("accounts/index.js");
  const { createPublicClient, createWalletClient, http, parseUnits, parseEther, formatUnits } = viem;

  const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8"));
  const npm = deployment.projectXNpm;
  const adapter = deployment.projectXAdapter;
  if (!npm || !adapter) throw new Error("projectXNpm / projectXAdapter missing in 998.json");

  const account = privateKeyToAccount(pk);
  const chain = {
    id: 998,
    name: "HyperEVM Testnet",
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  };
  const transport = http(RPC);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  const adapterAbi = [
    { name: "positionTokenId", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
    { name: "token0", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
    { name: "token1", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  ];
  const erc20Abi = [
    { name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
    {
      name: "approve",
      type: "function",
      inputs: [{ type: "address" }, { type: "uint256" }],
      outputs: [{ type: "bool" }],
      stateMutability: "nonpayable",
    },
  ];
  const npmAbi = [
    {
      name: "accrueFees",
      type: "function",
      inputs: [{ type: "uint256" }, { type: "uint128" }, { type: "uint128" }],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ];

  const tokenId = await publicClient.readContract({
    address: adapter,
    abi: adapterAbi,
    functionName: "positionTokenId",
  });
  if (tokenId === 0n) throw new Error("No LP position — deposit to vault first");

  const token0 = await publicClient.readContract({ address: adapter, abi: adapterAbi, functionName: "token0" });
  const whype = deployment.tokenKHYPE.toLowerCase();
  const usdc = deployment.tokenUSDC.toLowerCase();
  const whypeIs0 = token0.toLowerCase() === whype;

  const feeWhype = parseEther(FEE_WHYPE);
  const feeUsdc = parseUnits(FEE_USDC, 6);
  const amount0 = whypeIs0 ? feeWhype : feeUsdc;
  const amount1 = whypeIs0 ? feeUsdc : feeWhype;

  if (amount0 === 0n && amount1 === 0n) throw new Error("Set FEE_WHYPE and/or FEE_USDC > 0");

  const usdcToken = whypeIs0 ? deployment.token1 : deployment.token0;
  const whypeToken = whypeIs0 ? deployment.token0 : deployment.token1;
  if (feeUsdc > 0n) {
    const walletUsdc = await publicClient.readContract({
      address: usdcToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (walletUsdc < feeUsdc) {
      throw new Error(`Need ${FEE_USDC} USDC in wallet, have ${formatUnits(walletUsdc, 6)}`);
    }
    const apprUsdc = await walletClient.writeContract({
      address: usdcToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [npm, feeUsdc],
    });
    await publicClient.waitForTransactionReceipt({ hash: apprUsdc });
  }
  if (feeWhype > 0n) {
    const apprWhype = await walletClient.writeContract({
      address: whypeToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [npm, feeWhype],
    });
    await publicClient.waitForTransactionReceipt({ hash: apprWhype });
  }

  console.log("==> Accrue mock fees (998)");
  console.log(`    NPM: ${npm}`);
  console.log(`    tokenId: ${tokenId}`);
  console.log(`    amount0: ${amount0}, amount1: ${amount1}`);

  const hash = await walletClient.writeContract({
    address: npm,
    abi: npmAbi,
    functionName: "accrueFees",
    args: [tokenId, amount0, amount1],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("    ✓ Fees accrued — run: DEPLOYMENT_CHAIN=998 node scripts/daily-rewards.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
