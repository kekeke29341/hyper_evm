#!/usr/bin/env node
/**
 * Attempt to move idle USDC/WHYPE from old vault to ops wallet.
 * Note: recoverForeignToken reverts for USDC/WHYPE (underlying assets).
 * Full NAV requires shareholder withdraw() from the wallet that holds shares.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL ?? "https://hyperliquid.drpc.org";
const OLD_VAULT = "0xe5f4d055c5e2d29f26862a543377c2525a41dde8";
const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";
const WHYPE = "0x5555555555555555555555555555555555555555";

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
}

loadEnv();
const pk = process.env.MAIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!pk) throw new Error("Set MAIN_PRIVATE_KEY");
const normalizedPk = pk.startsWith("0x") ? pk : `0x${pk}`;

const viem = await import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/index.js")).href);
const { formatUnits } = viem;
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm/accounts/index.js")).href
);

const account = privateKeyToAccount(normalizedPk);
const vaultAbi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
);
const erc20Abi = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MockERC20.json"), "utf8")
);

const chain = {
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
const publicClient = viem.createPublicClient({ chain, transport: viem.http(RPC) });
const walletClient = viem.createWalletClient({ account, chain, transport: viem.http(RPC) });

const [owner, shares, assets, idleUsdc, idleWhype, paused] = await Promise.all([
  publicClient.readContract({ address: OLD_VAULT, abi: vaultAbi, functionName: "owner" }),
  publicClient.readContract({ address: OLD_VAULT, abi: vaultAbi, functionName: "balanceOf", args: [account.address] }),
  publicClient.readContract({ address: OLD_VAULT, abi: vaultAbi, functionName: "totalAssetsUsdc" }),
  publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [OLD_VAULT] }),
  publicClient.readContract({ address: WHYPE, abi: erc20Abi, functionName: "balanceOf", args: [OLD_VAULT] }),
  publicClient.readContract({ address: OLD_VAULT, abi: vaultAbi, functionName: "paused" }),
]);

console.log("Ops:", account.address);
console.log("Vault owner:", owner);
console.log("Ops shares:", shares.toString());
console.log("totalAssetsUsdc:", formatUnits(assets, 6), "USDC (includes LP in adapter)");
console.log("Idle on vault — USDC:", formatUnits(idleUsdc, 6), "WHYPE:", formatUnits(idleWhype, 18));
console.log("paused:", paused);

if (account.address.toLowerCase() !== owner.toLowerCase()) {
  throw new Error("MAIN_PRIVATE_KEY is not vault owner");
}

async function tryCall(label, fn) {
  try {
    await publicClient.simulateContract({ ...fn, account: account.address });
    const hash = await walletClient.writeContract(fn);
    console.log(`OK ${label}:`, hash);
    await publicClient.waitForTransactionReceipt({ hash });
    return true;
  } catch (e) {
    console.log(`FAIL ${label}:`, e.shortMessage ?? e.message);
    return false;
  }
}

// 1. recoverForeignToken — blocked for USDC/WHYPE
await tryCall("recoverForeignToken(USDC)", {
  address: OLD_VAULT,
  abi: vaultAbi,
  functionName: "recoverForeignToken",
  args: [USDC, account.address, idleUsdc],
});

await tryCall("recoverForeignToken(WHYPE)", {
  address: OLD_VAULT,
  abi: vaultAbi,
  functionName: "recoverForeignToken",
  args: [WHYPE, account.address, idleWhype],
});

// 2. withdraw — needs shares
if (shares > 0n) {
  await tryCall("withdraw(all shares)", {
    address: OLD_VAULT,
    abi: vaultAbi,
    functionName: "withdraw",
    args: [shares, account.address],
  });
} else {
  console.log("SKIP withdraw: ops has 0 shares (holder is 0xf35208bf…)");
}

const [idleUsdcAfter, idleWhypeAfter] = await Promise.all([
  publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [OLD_VAULT] }),
  publicClient.readContract({ address: WHYPE, abi: erc20Abi, functionName: "balanceOf", args: [OLD_VAULT] }),
]);
console.log("\nVault idle after attempts — USDC:", formatUnits(idleUsdcAfter, 6), "WHYPE:", formatUnits(idleWhypeAfter, 18));
