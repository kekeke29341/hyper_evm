#!/usr/bin/env node
/**
 * Move operator shares from old vault → new vault and open initial 0.3% LP position.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { fetchOracleRefPrice } from "./lib/oracle-price.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL ?? "https://hyperliquid.drpc.org";
const CHAIN = 999;

function loadEnv() {
  for (const f of [".env", ".env.local", ".env.testnet", ".env.mainnet"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq);
      if (!process.env[k]) process.env[k] = t.slice(eq + 1);
    }
  }
  let pk = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (pk && !pk.startsWith("0x")) pk = `0x${pk}`;
  process.env.PRIVATE_KEY = pk;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

loadEnv();
if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY required");

const dep = JSON.parse(
  fs.readFileSync(path.join(root, "contracts/deployments/999.json"), "utf8")
);
const OLD_VAULT = dep.previousVault ?? dep.previousHyperpoolVault;
const NEW_VAULT = dep.hyperpoolVault;
const USDC = dep.tokenUSDC;
const ORACLE = dep.oracle;

if (!OLD_VAULT || !NEW_VAULT) throw new Error("Missing vault addresses in 999.json");

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { formatUnits, maxUint256 } = viem;
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const vaultAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
);
const erc20Abi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MockERC20.json"), "utf8")
);
const oracleAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperCoreOracle.json"), "utf8")
);

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const chain = {
  id: CHAIN,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });

async function send(label, request) {
  console.log(`==> ${label}`);
  const hash = await walletClient.writeContract(request);
  console.log("   tx", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed`);
  await sleep(2000);
  return hash;
}

const shares = await publicClient.readContract({
  address: OLD_VAULT,
  abi: vaultAbi,
  functionName: "balanceOf",
  args: [account.address],
});

console.log("Operator shares on old vault:", shares.toString());

if (shares > 0n) {
  const paused = await publicClient.readContract({
    address: OLD_VAULT,
    abi: vaultAbi,
    functionName: "paused",
  });
  if (paused) {
    await send("oldVault.unpause", {
      address: OLD_VAULT,
      abi: vaultAbi,
      functionName: "unpause",
    });
  }
  const usdcBefore = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  await send("oldVault.withdraw", {
    address: OLD_VAULT,
    abi: vaultAbi,
    functionName: "withdraw",
    args: [shares, account.address],
  });

  const usdcAfter = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const withdrawn = usdcAfter - usdcBefore;
  console.log("Withdrawn USDC:", formatUnits(withdrawn, 6));

  if (withdrawn > 0n) {
    await send("usdc.approve(newVault)", {
      address: USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [NEW_VAULT, maxUint256],
    });
    await send("newVault.depositUSDC", {
      address: NEW_VAULT,
      abi: vaultAbi,
      functionName: "depositUSDC",
      args: [withdrawn, account.address],
    });
  }
} else {
  const usdcBal = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const newSupply = await publicClient.readContract({
    address: NEW_VAULT,
    abi: vaultAbi,
    functionName: "totalSupply",
  });
  // Mainnet smoke needs ~0.07 USDC; smaller amounts often fail during single-sided swap + mint.
  if (newSupply === 0n && usdcBal >= 70_000n) {
    console.log("Depositing available USDC:", formatUnits(usdcBal, 6));
    await send("usdc.approve(newVault)", {
      address: USDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [NEW_VAULT, maxUint256],
    });
    await send("newVault.depositUSDC", {
      address: NEW_VAULT,
      abi: vaultAbi,
      functionName: "depositUSDC",
      args: [usdcBal, account.address],
    });
  }
}

const refPrice = await fetchOracleRefPrice(publicClient, ORACLE, 159, oracleAbi);
if (!refPrice) throw new Error("Oracle unavailable for rebalance");
console.log("Rebalance ref price:", refPrice.toString());

await send("newVault.rebalance", {
  address: NEW_VAULT,
  abi: vaultAbi,
  functionName: "rebalance",
  args: [refPrice],
});

const adapter = dep.projectXAdapter;
const adapterAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/ProjectXAdapter.json"), "utf8")
);
const [tokenId, tickLower, tickUpper, fee] = await Promise.all([
  publicClient.readContract({ address: adapter, abi: adapterAbi, functionName: "positionTokenId" }),
  publicClient.readContract({ address: adapter, abi: adapterAbi, functionName: "tickLower" }),
  publicClient.readContract({ address: adapter, abi: adapterAbi, functionName: "tickUpper" }),
  publicClient.readContract({ address: adapter, abi: adapterAbi, functionName: "fee" }),
]);

console.log("\nNew 0.3% position:", { tokenId: tokenId.toString(), tickLower, tickUpper, fee });

await send("oldVault.pause", {
  address: OLD_VAULT,
  abi: vaultAbi,
  functionName: "pause",
});

console.log("Old vault re-paused. Remaining shareholders must contact ops to migrate.");
