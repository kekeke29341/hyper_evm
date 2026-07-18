#!/usr/bin/env node
/**
 * Keeper: rebalance Project X LP position (+10% / -17% ticks), then deploy vault idle to LP.
 * Uses HyperCore oracle when available; falls back to REF_PRICE_USDC6 env.
 *
 * Env: PRIVATE_KEY, RPC_URL, DEPLOYMENT_CHAIN=999|998
 *      REF_PRICE_USDC6 (optional override, 6-dec USDC per 1 HYPE)
 *      HYPE_ORACLE_ASSET_ID (default 159)
 *      SKIP_ORACLE=1 (use REF_PRICE only, for mock NPM testnet)
 *      SKIP_DEPLOY_IDLE=1 (skip deployIdle after rebalance)
 *      MIN_IDLE_DEPLOY_USDC (default 50 — skip deployIdle when idle value is below this)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { fetchOracleRefPrice, refPriceToUsdc6 } from "./lib/oracle-price.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN = Number(process.env.DEPLOYMENT_CHAIN ?? "999");
const RPC =
  process.env.RPC_URL ??
  (CHAIN === 998 ? "https://rpcs.chain.link/hyperevm/testnet" : "https://rpc.hyperliquid.xyz/evm");
const HYPE_ORACLE_ASSET_ID = Number(process.env.HYPE_ORACLE_ASSET_ID ?? "159");
const MAX_DEVIATION_BPS = Number(process.env.MAX_REBALANCE_DEVIATION_BPS ?? "500");
const MIN_IDLE_DEPLOY_USDC = Number(process.env.MIN_IDLE_DEPLOY_USDC ?? "10");
const SKIP_DEPLOY_IDLE = process.env.SKIP_DEPLOY_IDLE === "1";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

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

loadEnv();

if (!process.env.PRIVATE_KEY) {
  throw new Error("Set PRIVATE_KEY or MAIN_PRIVATE_KEY in .env / .env.testnet / .env.mainnet");
}

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const depPath = path.join(root, "frontend/src/lib/contracts/deployments", `${CHAIN}.json`);
const deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
const vaultAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
);
const adapterAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/ProjectXAdapter.json"), "utf8")
);
const oracleAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperCoreOracle.json"), "utf8")
);

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const chain = {
  id: CHAIN,
  name: CHAIN === 999 ? "HyperEVM" : "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });

const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
const adapter = deployment.projectXAdapter;
if (!vault) throw new Error("hyperpoolVault not in deployment JSON");

async function readVaultIdleUsdc() {
  const whype = deployment.tokenKHYPE;
  const usdc = deployment.tokenUSDC;
  if (!whype || !usdc) {
    throw new Error("tokenKHYPE / tokenUSDC missing from deployment JSON");
  }

  const hypeBal = await publicClient.readContract({
    address: whype,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [vault],
  });
  const usdcBal = await publicClient.readContract({
    address: usdc,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [vault],
  });
  const pendingRewards = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pendingUserRewards",
  });

  let price = 0n;
  if (adapter) {
    price = await publicClient.readContract({
      address: adapter,
      abi: adapterAbi,
      functionName: "currentPoolPriceUsdc6PerHype18",
    });
  }
  if (!price || price === 0n) {
    price = await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "oraclePriceUsdc6PerHype18",
    });
  }

  const withdrawableUsdc = usdcBal > pendingRewards ? usdcBal - pendingRewards : 0n;
  const hypeUsdc = price > 0n ? (hypeBal * price) / 10n ** 30n : 0n;
  return {
    hypeBal,
    withdrawableUsdc,
    totalUsdc: withdrawableUsdc + hypeUsdc,
  };
}

async function maybeDeployIdle() {
  if (SKIP_DEPLOY_IDLE) {
    console.log("deployIdle: SKIP_DEPLOY_IDLE=1, skip");
    return;
  }

  const idle = await readVaultIdleUsdc();
  const idleUsdcHuman = Number(idle.totalUsdc) / 1e6;
  console.log("Vault idle:", {
    khype: idle.hypeBal.toString(),
    usdc: idle.withdrawableUsdc.toString(),
    totalUsdcApprox: idleUsdcHuman.toFixed(6),
  });

  if (idle.hypeBal === 0n && idle.withdrawableUsdc === 0n) {
    console.log("deployIdle: no vault idle, skip");
    return;
  }

  if (idleUsdcHuman < MIN_IDLE_DEPLOY_USDC) {
    console.log(
      `deployIdle: idle ~${idleUsdcHuman.toFixed(2)} USDC < min ${MIN_IDLE_DEPLOY_USDC}, skip`
    );
    return;
  }

  try {
    const hash = await walletClient.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "deployIdle",
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("deployIdle tx", receipt.transactionHash);
  } catch (err) {
    const msg = err?.shortMessage ?? err?.message ?? String(err);
    console.warn("deployIdle failed (rebalance already succeeded):", msg);
  }
}

let refPrice = null;

if (process.env.REF_PRICE_USDC6) {
  refPrice = BigInt(process.env.REF_PRICE_USDC6) * 10n ** 12n;
  console.log("Using REF_PRICE_USDC6 override:", process.env.REF_PRICE_USDC6);
} else if (process.env.SKIP_ORACLE !== "1" && deployment.oracle) {
  refPrice = await fetchOracleRefPrice(publicClient, deployment.oracle, HYPE_ORACLE_ASSET_ID, oracleAbi);
  if (refPrice) {
    console.log("Oracle ref price (usdc6/HYPE):", refPriceToUsdc6(refPrice).toString());
  }
}

if (!refPrice) {
  refPrice = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "oraclePriceUsdc6PerHype18",
  });
  if (refPrice && refPrice > 0n) {
    console.log("Vault oraclePriceUsdc6PerHype18:", refPriceToUsdc6(refPrice).toString());
  }
}

if (!refPrice || refPrice === 0n) {
  if (deployment.oracle && process.env.SKIP_ORACLE !== "1") {
    throw new Error(
      "Oracle price unavailable — set REF_PRICE_USDC6, SKIP_ORACLE=1, or fix HyperCore oracle before rebalance"
    );
  }
  refPrice = 42n * 10n ** 6n * 10n ** 12n;
  console.warn("No oracle — fallback ref price 42 USDC/HYPE (SKIP_ORACLE=1 only)");
}

const onChainOracle = await publicClient.readContract({
  address: vault,
  abi: vaultAbi,
  functionName: "oraclePriceUsdc6PerHype18",
});
if (onChainOracle > 0n) {
  const diff = refPrice > onChainOracle ? refPrice - onChainOracle : onChainOracle - refPrice;
  const devBps = Number((diff * 10000n) / onChainOracle);
  console.log(`Deviation from on-chain oracle: ${devBps} bps (max ${MAX_DEVIATION_BPS})`);
  if (devBps > MAX_DEVIATION_BPS) {
    throw new Error(`Ref price deviates ${devBps} bps > max ${MAX_DEVIATION_BPS}`);
  }
}

console.log("Rebalance ref price (usdc6PerHype18):", refPrice.toString());

// Harvest fees BEFORE rebalance: adapter.rebalance() collects only the principal
// returned by decreaseLiquidity, so any uncollected fees would be stranded on the
// abandoned NFT when the position is re-minted. harvestFees() collects the full
// tokensOwed (uint128.max) on the current position and books the 60% user share
// into pendingUserRewards, so nothing is left behind.
try {
  const pendingBefore = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pendingUserRewards",
  });
  const harvestHash = await walletClient.writeContract({
    address: vault,
    abi: vaultAbi,
    functionName: "harvestFees",
  });
  await publicClient.waitForTransactionReceipt({ hash: harvestHash });
  const pendingAfter = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "pendingUserRewards",
  });
  console.log(
    `harvestFees before rebalance tx ${harvestHash} — pendingUserRewards ${pendingBefore} -> ${pendingAfter}`
  );
} catch (err) {
  const msg = err?.shortMessage ?? err?.message ?? String(err);
  console.warn("harvestFees before rebalance failed (continuing with rebalance):", msg);
}

const hash = await walletClient.writeContract({
  address: vault,
  abi: vaultAbi,
  functionName: "rebalance",
  args: [refPrice],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("rebalance tx", receipt.transactionHash);

if (adapter) {
  const tickLower = await publicClient.readContract({
    address: adapter,
    abi: adapterAbi,
    functionName: "tickLower",
  });
  const tickUpper = await publicClient.readContract({
    address: adapter,
    abi: adapterAbi,
    functionName: "tickUpper",
  });
  console.log("ticks:", { tickLower, tickUpper });
}

await maybeDeployIdle();
