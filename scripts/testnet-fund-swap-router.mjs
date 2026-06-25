#!/usr/bin/env node
/**
 * Deploy fresh MockSwapRouter, point vault at it, prefund with wallet USDC.
 * Usage: source scripts/testnet-env.sh && ROUTER_FUND_USDC=0.05 node scripts/testnet-fund-swap-router.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { execSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const ROUTER_FUND_USDC = process.env.ROUTER_FUND_USDC ?? "0.05";

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
  if (!process.env.PRIVATE_KEY) throw new Error("Set MAIN_PRIVATE_KEY in .env.testnet");

  const deployment = JSON.parse(
    fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8")
  );
  const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;

  console.log("==> Deploy MockSwapRouter (998)");
  const out = execSync(
    `cd "${root}/contracts" && forge create src/mocks/MockSwapRouter.sol:MockSwapRouter --rpc-url "${RPC}" --private-key "${process.env.PRIVATE_KEY}" --broadcast --constructor-args ${42e6 * 1e12}`,
    { encoding: "utf8" }
  );
  const match = out.match(/Deployed to: (0x[a-fA-F0-9]{40})/);
  if (!match) throw new Error(`forge create failed:\n${out}`);
  const router = match[1];
  console.log(`    Router: ${router}`);

  const viem = await viemImport("index.js");
  const { privateKeyToAccount } = await viemImport("accounts/index.js");
  const { createPublicClient, createWalletClient, http, parseUnits, formatUnits } = viem;
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const chain = {
    id: 998,
    name: "HyperEVM Testnet",
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  };
  const transport = http(RPC);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  const vaultAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
  );
  const erc20Abi = [
    { name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "approve", type: "function", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  ];
  const routerAbi = [
    { name: "fund", type: "function", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  ];

  console.log("==> vault.setSwapRouter");
  const setHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "setSwapRouter",
    args: [router],
  });
  await publicClient.waitForTransactionReceipt({ hash: setHash });

  const fundAmount = parseUnits(ROUTER_FUND_USDC, 6);
  const walletUsdc = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (walletUsdc < fundAmount) {
    throw new Error(`Need ${ROUTER_FUND_USDC} USDC to fund router (have ${formatUnits(walletUsdc, 6)})`);
  }

  console.log(`==> Fund router with ${ROUTER_FUND_USDC} USDC`);
  const appr = await walletClient.writeContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [router, fundAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: appr });
  const fundHash = await walletClient.writeContract({
    address: router,
    abi: routerAbi,
    functionName: "fund",
    args: [deployment.tokenUSDC, fundAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash });

  deployment.swapRouter = router;
  for (const p of [
    path.join(root, "contracts/deployments/998.json"),
    path.join(root, "frontend/src/lib/contracts/deployments/998.json"),
  ]) {
    fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
