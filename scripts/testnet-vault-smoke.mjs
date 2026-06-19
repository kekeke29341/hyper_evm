#!/usr/bin/env node
/**
 * Testnet vault E2E: partial withdraw round-trip (requires existing shares).
 * Usage: source scripts/testnet-env.sh && node scripts/testnet-vault-smoke.mjs
 *
 * Env: WITHDRAW_BPS=1000 (default 10% of shares), REDEPOSIT=1 to wrap+deposit withdrawn WHYPE
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const WHYPE = "0x5555555555555555555555555555555555555555";
const WITHDRAW_BPS = Number(process.env.WITHDRAW_BPS ?? "1000");
const REDEPOSIT = process.env.REDEPOSIT !== "0";

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
  const { createPublicClient, createWalletClient, http, formatEther, formatUnits } = viem;

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

  const vaultAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
  );
  const erc20Abi = [
    { name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "approve", type: "function", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  ];

  console.log("==> Testnet vault smoke (998)");
  console.log(`    Wallet: ${account.address}`);
  console.log(`    Vault: ${vault}`);

  const sharesBefore = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const navBefore = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalAssetsUsdc",
  });

  console.log(`    Shares: ${sharesBefore}`);
  console.log(`    NAV: ${formatUnits(navBefore, 6)} USDC`);

  if (sharesBefore === 0n) {
    console.log("\n⚠ No vault shares — run: LP_USDC=0 VAULT_DEPOSIT_HYPE=0.02 node scripts/testnet-post-deploy.mjs");
    process.exit(2);
  }

  const withdrawShares = (sharesBefore * BigInt(WITHDRAW_BPS)) / 10000n;
  if (withdrawShares === 0n) throw new Error("WITHDRAW_BPS too small for current shares");

  const usdcBefore = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const whypeBefore = await publicClient.readContract({
    address: WHYPE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  console.log(`\n[1/2] Withdraw ${WITHDRAW_BPS / 100}% shares (${withdrawShares})...`);
  const wHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "withdraw",
    args: [withdrawShares, account.address],
  });
  await publicClient.waitForTransactionReceipt({ hash: wHash });

  const usdcAfter = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const whypeAfter = await publicClient.readContract({
    address: WHYPE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  const gotUsdc = usdcAfter - usdcBefore;
  const gotWhype = whypeAfter - whypeBefore;
  console.log(`    ✓ Received ${formatUnits(gotUsdc, 6)} USDC + ${formatEther(gotWhype)} WHYPE`);

  const sharesAfter = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`    Shares after: ${sharesAfter}`);

  if (REDEPOSIT && gotWhype > 0n) {
    console.log(`\n[2/2] Re-deposit ${formatEther(gotWhype)} WHYPE...`);
    const appr = await walletClient.writeContract({
      address: WHYPE,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, gotWhype],
    });
    await publicClient.waitForTransactionReceipt({ hash: appr });

    const dHash = await walletClient.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "depositHYPE",
      args: [gotWhype, account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: dHash });

    const sharesFinal = await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(`    ✓ Shares after re-deposit: ${sharesFinal}`);
  } else {
    console.log("\n[2/2] Re-deposit skipped (REDEPOSIT=0 or no WHYPE received)");
  }

  const navAfter = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalAssetsUsdc",
  });
  console.log(`\n==> Vault smoke OK — NAV ${formatUnits(navBefore, 6)} → ${formatUnits(navAfter, 6)} USDC`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
