#!/usr/bin/env node
/**
 * Testnet: deposit wallet USDC into HyperpoolVault.
 * Usage: source scripts/testnet-env.sh && DEPOSIT_USDC=10 node scripts/testnet-usdc-deposit.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const DEPOSIT_USDC = process.env.DEPOSIT_USDC ?? "10";

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
  const { createPublicClient, createWalletClient, http, parseUnits, formatUnits } = viem;

  const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8"));
  const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
  if (!vault) throw new Error("hyperpoolVault missing");

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

  const erc20Abi = [
    { name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "approve", type: "function", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  ];
  const vaultAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
  );

  const amount = parseUnits(DEPOSIT_USDC, 6);
  const bal = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (bal < amount) throw new Error(`Need ${DEPOSIT_USDC} USDC, have ${formatUnits(bal, 6)}`);

  console.log(`==> Vault USDC deposit: ${DEPOSIT_USDC} USDC`);
  const appr = await walletClient.writeContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [vault, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: appr });

  const dep = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "depositUSDC",
    args: [amount, account.address],
  });
  await publicClient.waitForTransactionReceipt({ hash: dep });

  const shares = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`    ✓ Shares: ${shares}`);

  deployment.vaultShareHolders = [{ address: account.address, shares: shares.toString() }];
  for (const p of [
    path.join(root, "contracts/deployments/998.json"),
    path.join(root, "frontend/src/lib/contracts/deployments/998.json"),
  ]) {
    fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
