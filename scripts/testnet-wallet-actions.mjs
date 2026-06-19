#!/usr/bin/env node
/**
 * Testnet wallet smoke: cashdrop claim + optional vault partial withdraw.
 * Usage: source scripts/testnet-env.sh && node scripts/testnet-wallet-actions.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const WITHDRAW_BPS = Number(process.env.WITHDRAW_BPS ?? "0");

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

  const { getMerkleProof } = await import(pathToFileURL(path.join(root, "scripts/lib/merkle.mjs")).href);

  const viem = await viemImport("index.js");
  const { privateKeyToAccount } = await viemImport("accounts/index.js");
  const { createPublicClient, createWalletClient, http, formatUnits, formatEther } = viem;

  const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/998.json"), "utf8"));
  const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
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
  ];
  const vaultAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
  );
  const airdropAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"), "utf8")
  );

  console.log("==> Testnet wallet actions (998)");
  console.log(`    Wallet: ${account.address}`);
  console.log(`    Vault: ${vault}`);

  const hypeBal = await publicClient.getBalance({ address: account.address });
  console.log(`    HYPE: ${formatEther(hypeBal)}`);

  // 1. Cashdrop claim
  console.log("\n[1/2] Cashdrop claim...");
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
      amount: e.amount,
      minShares: e.minShares,
    }));
    const vaultShareToken = await publicClient.readContract({
      address: deployment.airdrop,
      abi: airdropAbi,
      functionName: "vaultShareToken",
    });
    const gated =
      vaultShareToken && vaultShareToken.toLowerCase() !== "0x0000000000000000000000000000000000000000";
    const claimable = getMerkleProof(entries, account.address, gated);
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
          args: [claimable.amount, claimable.minShares, claimable.proof],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`    ✓ Claimed ${formatUnits(claimable.amount, 6)} USDC`);
      }
    }
  }

  // 2. Optional vault withdraw
  if (WITHDRAW_BPS > 0 && vault) {
    console.log(`\n[2/2] Vault withdraw ${WITHDRAW_BPS / 100}%...`);
    const shares = await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "balanceOf",
      args: [account.address],
    });
    const withdrawShares = (shares * BigInt(WITHDRAW_BPS)) / 10000n;
    if (withdrawShares === 0n) {
      console.log("    ⚠ No shares to withdraw");
    } else {
      const hash = await walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: "withdraw",
        args: [withdrawShares, account.address],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`    ✓ Withdrew ${withdrawShares} shares`);
    }
  } else {
    console.log("\n[2/2] Vault withdraw — skipped (set WITHDRAW_BPS>0 to enable)");
  }

  console.log("\n==> Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
