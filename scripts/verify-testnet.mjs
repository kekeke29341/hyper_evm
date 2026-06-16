#!/usr/bin/env node
/**
 * Smoke-check testnet deployment + pool liquidity from contracts/deployments/998.json
 * Usage: node scripts/verify-testnet.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";

async function viemImport(subpath) {
  return import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm", subpath)).href);
}

async function main() {
  const deployPath = path.join(root, "contracts/deployments/998.json");
  const d = JSON.parse(fs.readFileSync(deployPath, "utf8"));
  if (!d.deployed) throw new Error("998.json not deployed");

  const viem = await viemImport("index.js");
  const { createPublicClient, http, parseUnits, formatUnits } = viem;
  const client = createPublicClient({ chain: { id: 998 }, transport: http(RPC) });

  const routerAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/ProjectXRouter.json"), "utf8")
  );
  const pairAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/ProjectXPair.json"), "utf8")
  );
  const erc20Abi = [
    { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  ];
  const airdropAbi = [
    { name: "merkleRoot", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  ];

  const checks = [];

  async function hasCode(label, address) {
    const code = await client.getBytecode({ address });
    const ok = code && code !== "0x";
    checks.push({ label: `${label} bytecode`, ok, detail: address });
    return ok;
  }

  await hasCode("Factory", d.factory);
  await hasCode("Router", d.router);
  await hasCode("Pair", d.pair);
  await hasCode("Points", d.pointsDistributor);
  await hasCode("Vault", d.liquidityVault);
  await hasCode("Airdrop", d.airdrop);

  const [r0, r1] = await client.readContract({
    address: d.pair,
    abi: pairAbi,
    functionName: "getReserves",
  });
  const token0 = await client.readContract({ address: d.pair, abi: pairAbi, functionName: "token0" });
  const khypeIs0 = token0.toLowerCase() === d.tokenKHYPE.toLowerCase();
  const reserveKhype = khypeIs0 ? r0 : r1;
  const reserveUsdc = khypeIs0 ? r1 : r0;
  const poolOk = reserveKhype > 0n && reserveUsdc > 0n;
  checks.push({
    label: "Pool reserves > 0",
    ok: poolOk,
    detail: `${formatUnits(reserveKhype, 18)} kHYPE / ${formatUnits(reserveUsdc, 6)} USDC`,
  });

  const amounts = await client.readContract({
    address: d.router,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [parseUnits("0.01", 18), [d.tokenKHYPE, d.tokenUSDC]],
  });
  const quoteOk = amounts[1] > 0n;
  checks.push({
    label: "Swap quote (0.01 kHYPE)",
    ok: quoteOk,
    detail: `${formatUnits(amounts[1], 6)} USDC`,
  });

  const merkleRoot = await client.readContract({ address: d.airdrop, abi: airdropAbi, functionName: "merkleRoot" });
  const rootOk = merkleRoot !== `0x${"0".repeat(64)}`;
  checks.push({ label: "Merkle root set", ok: rootOk, detail: String(merkleRoot) });

  const airdropBal = await client.readContract({
    address: d.tokenUSDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [d.airdrop],
  });
  const claimTotal =
    d.airdropEntries?.reduce((s, e) => s + BigInt(e.amount), 0n) ?? 0n;
  const fundOk = airdropBal >= claimTotal;
  checks.push({
    label: "Airdrop USDC >= claim total",
    ok: fundOk,
    detail: `contract ${formatUnits(airdropBal, 6)} USDC, claims need ${formatUnits(claimTotal, 6)}`,
  });

  console.log("==> Testnet verify (chain 998)");
  console.log(`    RPC: ${RPC}`);
  console.log(`    Router: ${d.router}`);
  console.log(`    Pair: ${d.pair}`);
  console.log("");

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    console.log(`${mark} ${c.label}: ${c.detail}`);
    if (!c.ok) failed++;
  }

  console.log("");
  if (failed > 0) {
    console.log(`FAILED: ${failed} check(s). See docs/本番運用/検証手順.md`);
    process.exit(1);
  }
  console.log("All checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
