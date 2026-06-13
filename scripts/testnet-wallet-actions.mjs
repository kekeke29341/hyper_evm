#!/usr/bin/env node
/**
 * Testnet wallet smoke: wrap HYPE → WHYPE, claim cashdrop, small swap.
 * Usage: source scripts/testnet-env.sh && node scripts/testnet-wallet-actions.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const WHYPE = "0x5555555555555555555555555555555555555555";
const WRAP_HYPE = process.env.WRAP_HYPE ?? "0.02";
const SWAP_WHYPE = process.env.SWAP_WHYPE ?? "0.001";

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

function makeLeaf(address, amount, v) {
  const inner = v.keccak256(
    v.encodeAbiParameters(
      [{ name: "account", type: "address" }, { name: "amount", type: "uint256" }],
      [v.getAddress(address), amount]
    )
  );
  return v.keccak256(v.concat([inner]));
}

function getMerkleProof(entries, target, v) {
  const idx = entries.findIndex((e) => e.address.toLowerCase() === target.toLowerCase());
  if (idx === -1) return null;
  let layer = entries.map((e) => makeLeaf(e.address, e.amount, v));
  let index = idx;
  const proof = [];
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        if (i === index || i + 1 === index) {
          proof.push(index === i ? layer[i + 1] : layer[i]);
        }
        const [x, y] =
          layer[i].toLowerCase() <= layer[i + 1].toLowerCase()
            ? [layer[i], layer[i + 1]]
            : [layer[i + 1], layer[i]];
        next.push(v.keccak256(v.concat([x, y])));
      } else next.push(layer[i]);
    }
    index = Math.floor(index / 2);
    layer = next;
  }
  return { amount: entries[idx].amount, proof };
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
  const { createPublicClient, createWalletClient, http, parseEther, formatUnits, formatEther } = viem;

  const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8"));
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
  const routerAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/ProjectXRouter.json"), "utf8")
  );
  const airdropAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"), "utf8")
  );

  console.log("==> Testnet wallet actions (998)");
  console.log(`    Wallet: ${account.address}`);
  console.log(`    RPC: ${RPC}`);

  const hypeBal = await publicClient.getBalance({ address: account.address });
  console.log(`    HYPE: ${formatEther(hypeBal)}`);

  // 1. Wrap HYPE → WHYPE
  let whypeBal = await publicClient.readContract({
    address: WHYPE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  const wrapWei = parseEther(WRAP_HYPE);
  if (whypeBal < wrapWei) {
    console.log(`\n[1/3] Wrap ${WRAP_HYPE} HYPE → WHYPE...`);
    const hash = await walletClient.writeContract({
      address: WHYPE,
      abi: [{ name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] }],
      functionName: "deposit",
      value: wrapWei,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    whypeBal = await publicClient.readContract({
      address: WHYPE,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(`    ✓ WHYPE balance: ${formatEther(whypeBal)}`);
  } else {
    console.log(`\n[1/3] Skip wrap — WHYPE balance ${formatEther(whypeBal)}`);
  }

  // 2. Claim cashdrop
  console.log("\n[2/3] Cashdrop claim...");
  const claimed = await publicClient.readContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "claimed",
    args: [account.address],
  });

  if (claimed) {
    console.log("    ✓ Already claimed");
  } else if (!deployment.airdropEntries?.length) {
    console.log("    ⚠ No airdropEntries in 998.json — skip");
  } else {
    const entries = deployment.airdropEntries.map((e) => ({
      address: e.address,
      amount: BigInt(e.amount),
    }));
    const claimable = getMerkleProof(entries, account.address, viem);
    if (!claimable) {
      console.log("    ⚠ Wallet not in merkle tree");
    } else {
      const airdropUsdc = await publicClient.readContract({
        address: deployment.tokenUSDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [deployment.airdrop],
      });
      if (airdropUsdc < claimable.amount) {
        console.log(`    ⚠ Airdrop underfunded (${formatUnits(airdropUsdc, 6)} USDC) — run testnet-fund-airdrop.mjs`);
      } else {
        const hash = await walletClient.writeContract({
          address: deployment.airdrop,
          abi: airdropAbi,
          functionName: "claim",
          args: [claimable.amount, claimable.proof],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`    ✓ Claimed ${formatUnits(claimable.amount, 6)} USDC`);
      }
    }
  }

  // 3. Small swap WHYPE → USDC
  console.log(`\n[3/3] Swap ${SWAP_WHYPE} WHYPE → USDC...`);
  whypeBal = await publicClient.readContract({
    address: WHYPE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const swapIn = parseEther(SWAP_WHYPE);
  if (whypeBal < swapIn) {
    console.log(`    ⚠ Insufficient WHYPE (${formatEther(whypeBal)}) — skip swap`);
  } else {
    const amounts = await publicClient.readContract({
      address: deployment.router,
      abi: routerAbi,
      functionName: "getAmountsOut",
      args: [swapIn, [deployment.tokenKHYPE, deployment.tokenUSDC]],
    });
    const minOut = (amounts[1] * 95n) / 100n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    const appr = await walletClient.writeContract({
      address: deployment.tokenKHYPE,
      abi: erc20Abi,
      functionName: "approve",
      args: [deployment.router, swapIn],
    });
    await publicClient.waitForTransactionReceipt({ hash: appr });

    const swapHash = await walletClient.writeContract({
      address: deployment.router,
      abi: routerAbi,
      functionName: "swapExactTokensForTokens",
      args: [swapIn, minOut, [deployment.tokenKHYPE, deployment.tokenUSDC], account.address, deadline],
    });
    await publicClient.waitForTransactionReceipt({ hash: swapHash });

    const usdcBal = await publicClient.readContract({
      address: deployment.tokenUSDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(`    ✓ Swap done — USDC balance: ${formatUnits(usdcBal, 6)}`);
  }

  console.log("\n==> Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
