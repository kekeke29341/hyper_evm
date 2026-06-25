#!/usr/bin/env node
/**
 * Testnet: verify HYPE fee → USDC swap on harvest (MockSwapRouter + convertHypeFeesToUsdc).
 * Usage: source scripts/testnet-env.sh && node scripts/testnet-harvest-hype-to-usdc.mjs
 *
 * Env: DEPOSIT_USDC=0.03 | DEPOSIT_HYPE=0.01 (uses WHYPE if USDC insufficient), FEE_WHYPE=0.001
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const DEPOSIT_USDC = process.env.DEPOSIT_USDC ?? "0.03";
const DEPOSIT_HYPE = process.env.DEPOSIT_HYPE ?? "0.01";
const FEE_WHYPE = process.env.FEE_WHYPE ?? "0.001";
const OPERATOR_FEE_BPS = 3300n;
const USER_FEE_BPS = 6700n;
const BPS = 10_000n;
const USDC_PER_HYPE_6DEC = 42_000_000n; // 42 USDC with 6 decimals

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

function ok(label, detail) {
  console.log(`✓ ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, detail) {
  console.error(`✗ ${label}${detail ? `: ${detail}` : ""}`);
  process.exitCode = 1;
}

async function main() {
  loadEnv();
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Set MAIN_PRIVATE_KEY in .env.testnet");

  const viem = await viemImport("index.js");
  const { privateKeyToAccount } = await viemImport("accounts/index.js");
  const {
    createPublicClient,
    createWalletClient,
    http,
    parseUnits,
    parseEther,
    formatUnits,
    formatEther,
  } = viem;

  const deployment = JSON.parse(
    fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8")
  );
  const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
  const adapter = deployment.projectXAdapter;
  const npm = deployment.projectXNpm;
  if (!vault || !adapter || !npm) throw new Error("vault / adapter / npm missing in 998.json");

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
  const adapterAbi = [
    { name: "positionTokenId", type: "function", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
    { name: "token0", type: "function", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  ];
  const erc20Abi = [
    { name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "approve", type: "function", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
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

  console.log("==> Testnet HYPE→USDC harvest verify (998)");
  console.log(`    Vault: ${vault}`);
  console.log(`    Wallet: ${account.address}`);

  const [swapRouter, convertEnabled, operatorBps, operatorWallet] = await Promise.all([
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "swapRouter" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "convertHypeFeesToUsdc" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "operatorFeeBps" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "operatorWallet" }),
  ]);

  if (swapRouter && swapRouter !== "0x0000000000000000000000000000000000000000") {
    ok("swapRouter configured", swapRouter);
  } else {
    fail("swapRouter configured", "missing");
  }
  convertEnabled ? ok("convertHypeFeesToUsdc", "true") : fail("convertHypeFeesToUsdc", "false");
  operatorBps === OPERATOR_FEE_BPS
    ? ok("operatorFeeBps", String(operatorBps))
    : fail("operatorFeeBps", `expected ${OPERATOR_FEE_BPS}, got ${operatorBps}`);

  let tokenId = await publicClient.readContract({
    address: adapter,
    abi: adapterAbi,
    functionName: "positionTokenId",
  });

  if (tokenId === 0n) {
    const depositUsdcAmount = parseUnits(DEPOSIT_USDC, 6);
    const walletUsdc = await publicClient.readContract({
      address: deployment.tokenUSDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

    if (walletUsdc >= depositUsdcAmount) {
      console.log(`\n[setup] depositUSDC ${DEPOSIT_USDC}...`);
      const appr = await walletClient.writeContract({
        address: deployment.tokenUSDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, depositUsdcAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash: appr });
      const dep = await walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "depositUSDC",
        args: [depositUsdcAmount, account.address],
      });
      await publicClient.waitForTransactionReceipt({ hash: dep });
    } else {
      const depositHypeAmount = parseEther(DEPOSIT_HYPE);
      const walletWhype = await publicClient.readContract({
        address: deployment.tokenKHYPE,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      });
      if (walletWhype < depositHypeAmount) {
        throw new Error(
          `No LP position — need ${DEPOSIT_USDC} USDC or ${DEPOSIT_HYPE} WHYPE (have ${formatUnits(walletUsdc, 6)} USDC, ${formatEther(walletWhype)} WHYPE)`
        );
      }
      console.log(`\n[setup] depositHYPE ${DEPOSIT_HYPE}...`);
      const appr = await walletClient.writeContract({
        address: deployment.tokenKHYPE,
        abi: erc20Abi,
        functionName: "approve",
        args: [vault, depositHypeAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash: appr });
      const dep = await walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "depositHYPE",
        args: [depositHypeAmount, account.address],
      });
      await publicClient.waitForTransactionReceipt({ hash: dep });
    }

    tokenId = await publicClient.readContract({
      address: adapter,
      abi: adapterAbi,
      functionName: "positionTokenId",
    });
    ok("LP position minted", `tokenId ${tokenId}`);
  } else {
    ok("LP position exists", `tokenId ${tokenId}`);
  }

  const token0 = await publicClient.readContract({ address: adapter, abi: adapterAbi, functionName: "token0" });
  const whypeIs0 = token0.toLowerCase() === deployment.tokenKHYPE.toLowerCase();
  const feeWhype = parseEther(FEE_WHYPE);
  const amount0 = whypeIs0 ? feeWhype : 0n;
  const amount1 = whypeIs0 ? 0n : feeWhype;

  if (feeWhype > 0n) {
    const apprWhype = await walletClient.writeContract({
      address: deployment.tokenKHYPE,
      abi: erc20Abi,
      functionName: "approve",
      args: [npm, feeWhype],
    });
    await publicClient.waitForTransactionReceipt({ hash: apprWhype });
  }

  console.log(`\n[1/2] accrueFees WHYPE=${FEE_WHYPE}...`);
  const accrueHash = await walletClient.writeContract({
    address: npm,
    abi: npmAbi,
    functionName: "accrueFees",
    args: [tokenId, amount0, amount1],
  });
  await publicClient.waitForTransactionReceipt({ hash: accrueHash });
  ok("Fees accrued", `${FEE_WHYPE} WHYPE`);

  const feeUsdcTotal = (feeWhype * USDC_PER_HYPE_6DEC) / 10n ** 18n;
  const expectedOperator = (feeUsdcTotal * OPERATOR_FEE_BPS) / BPS;
  const expectedUser = feeUsdcTotal - expectedOperator;

  const pendingBefore = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pendingUserRewards",
  });
  const opUsdcBefore = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [operatorWallet],
  });
  const vaultWhypeBefore = await publicClient.readContract({
    address: deployment.tokenKHYPE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [vault],
  });

  console.log(`\n[2/2] harvestFees (expect ~${formatUnits(expectedUser, 6)} USDC user / ${formatUnits(expectedOperator, 6)} operator)...`);
  const harvestHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "harvestFees",
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: harvestHash });
  ok("harvestFees tx", receipt.transactionHash);

  const pendingAfter = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pendingUserRewards",
  });
  const opUsdcAfter = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [operatorWallet],
  });
  const vaultWhypeAfter = await publicClient.readContract({
    address: deployment.tokenKHYPE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [vault],
  });

  const pendingDelta = pendingAfter - pendingBefore;
  const opDelta = opUsdcAfter - opUsdcBefore;

  pendingDelta === expectedUser
    ? ok("pendingUserRewards delta", `${formatUnits(pendingDelta, 6)} USDC`)
    : fail(
        "pendingUserRewards delta",
        `expected ${formatUnits(expectedUser, 6)}, got ${formatUnits(pendingDelta, 6)}`
      );

  opDelta === expectedOperator
    ? ok("operator USDC delta", `${formatUnits(opDelta, 6)} USDC`)
    : fail(
        "operator USDC delta",
        `expected ${formatUnits(expectedOperator, 6)}, got ${formatUnits(opDelta, 6)}`
      );

  vaultWhypeAfter === vaultWhypeBefore
    ? ok("vault WHYPE unchanged (fees swapped)", formatEther(vaultWhypeAfter))
    : fail(
        "vault WHYPE unchanged",
        `before ${formatEther(vaultWhypeBefore)} after ${formatEther(vaultWhypeAfter)}`
      );

  console.log("\n==> HYPE→USDC harvest test complete.");
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
