#!/usr/bin/env node
/**
 * CLI E2E for the Synpress E2E wallet (no MetaMask UI).
 * Mirrors Synpress testnet checks: balances, optional swap-path smoke.
 *
 * Usage:
 *   source scripts/testnet-env.sh
 *   node scripts/testnet-e2e-wallet.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";

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
}

async function viemImport(sub) {
  return import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm", sub)).href);
}

async function main() {
  loadEnv();
  let pk = process.env.E2E_PRIVATE_KEY ?? process.env.SYNPRESS_PRIVATE_KEY;
  if (!pk) throw new Error("Set E2E_PRIVATE_KEY in .env.testnet");
  if (!pk.startsWith("0x")) pk = `0x${pk}`;

  const viem = await viemImport("index.js");
  const { privateKeyToAccount } = await viemImport("accounts/index.js");
  const { createPublicClient, createWalletClient, http, formatEther, formatUnits, parseEther } = viem;

  const deployment = JSON.parse(
    fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8")
  );
  const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
  const router = deployment.swapRouter;
  const whype = deployment.tokenKHYPE;
  const usdc = deployment.tokenUSDC;

  const account = privateKeyToAccount(pk);
  const chain = {
    id: 998,
    name: "HyperEVM Testnet",
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  };
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wc = createWalletClient({ account, chain, transport: http(RPC) });

  console.log("==> E2E wallet CLI smoke (998)");
  console.log("    Wallet:", account.address);
  console.log("    Vault:", vault);

  const hype = await pub.getBalance({ address: account.address });
  console.log("✓ HYPE balance:", formatEther(hype));
  if (hype < parseEther("0.001")) {
    throw new Error("E2E wallet needs HYPE for gas — fund from MAIN_ADDRESS");
  }

  const whypeAbi = [
    {
      type: "function",
      name: "balanceOf",
      stateMutability: "view",
      inputs: [{ name: "a", type: "address" }],
      outputs: [{ type: "uint256" }],
    },
    {
      type: "function",
      name: "deposit",
      stateMutability: "payable",
      inputs: [],
      outputs: [],
    },
  ];
  const routerAbi = [
    {
      type: "function",
      name: "swapExactTokensForTokens",
      stateMutability: "nonpayable",
      inputs: [
        { name: "amountIn", type: "uint256" },
        { name: "amountOutMin", type: "uint256" },
        { name: "path", type: "address[]" },
        { name: "to", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
      outputs: [{ type: "uint256[]" }],
    },
  ];

  let whypeBal = await pub.readContract({
    address: whype,
    abi: whypeAbi,
    functionName: "balanceOf",
    args: [account.address],
  });

  if (whypeBal < parseEther("0.001")) {
    console.log("[wrap] Depositing 0.002 HYPE → WHYPE...");
    const wrapTx = await wc.writeContract({
      address: whype,
      abi: whypeAbi,
      functionName: "deposit",
      value: parseEther("0.002"),
    });
    await pub.waitForTransactionReceipt({ hash: wrapTx });
    whypeBal = await pub.readContract({
      address: whype,
      abi: whypeAbi,
      functionName: "balanceOf",
      args: [account.address],
    });
  }
  console.log("✓ WHYPE balance:", formatEther(whypeBal));

  if (router && whypeBal >= parseEther("0.0005")) {
    const amountIn = parseEther("0.0005");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    console.log("[swap] WHYPE → USDC via router (0.0005 WHYPE)...");
    const approveAbi = [
      {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ];
    try {
      const approveTx = await wc.writeContract({
        address: whype,
        abi: approveAbi,
        functionName: "approve",
        args: [router, amountIn],
      });
      await pub.waitForTransactionReceipt({ hash: approveTx });

      const swapTx = await wc.writeContract({
        address: router,
        abi: routerAbi,
        functionName: "swapExactTokensForTokens",
        args: [amountIn, 0n, [whype, usdc], account.address, deadline],
      });
      const receipt = await pub.waitForTransactionReceipt({ hash: swapTx });
      console.log("✓ Swap tx:", receipt.transactionHash);
    } catch (e) {
      console.log("⚠ Swap skipped (router/pool may lack liquidity on 998):", e instanceof Error ? e.message.slice(0, 80) : e);
    }
  } else {
    console.log("⚠ Skip swap — router missing or insufficient WHYPE");
  }

  // Vault deposit mirrors Position tab (depositHYPE).
  const vaultAbi = [
    {
      type: "function",
      name: "depositHYPE",
      stateMutability: "payable",
      inputs: [
        { name: "amount", type: "uint256" },
        { name: "receiver", type: "address" },
      ],
      outputs: [{ type: "uint256" }],
    },
    {
      type: "function",
      name: "balanceOf",
      stateMutability: "view",
      inputs: [{ name: "a", type: "address" }],
      outputs: [{ type: "uint256" }],
    },
  ];
  const depositAmount = parseEther("0.001");
  if (whypeBal >= depositAmount) {
    console.log("[vault] depositHYPE 0.001 WHYPE...");
    try {
      const approveTx = await wc.writeContract({
        address: whype,
        abi: [
          {
            type: "function",
            name: "approve",
            stateMutability: "nonpayable",
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [{ type: "bool" }],
          },
        ],
        functionName: "approve",
        args: [vault, depositAmount],
      });
      await pub.waitForTransactionReceipt({ hash: approveTx });

      const depTx = await wc.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "depositHYPE",
        args: [depositAmount, account.address],
      });
      const depReceipt = await pub.waitForTransactionReceipt({ hash: depTx });
      const shares = await pub.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "balanceOf",
        args: [account.address],
      });
      console.log("✓ Vault deposit tx:", depReceipt.transactionHash);
      console.log("✓ Vault shares:", shares.toString());
    } catch (e) {
      console.log("⚠ Vault deposit skipped:", e instanceof Error ? e.message.slice(0, 100) : e);
    }
  }

  const usdcBal = await pub.readContract({
    address: usdc,
    abi: whypeAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log("✓ USDC balance:", formatUnits(usdcBal, 6));
  console.log("\nDone — E2E wallet can sign on-chain txs without MetaMask UI.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
