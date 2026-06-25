#!/usr/bin/env node
/**
 * Smoke-check testnet deployment (HyperpoolVault + ProjectXAdapter) from contracts/deployments/998.json
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

  const vault = d.hyperpoolVault ?? d.liquidityVault;
  const adapter = d.projectXAdapter;
  if (!vault) throw new Error("hyperpoolVault missing in 998.json");

  const viem = await viemImport("index.js");
  const { createPublicClient, http, formatUnits } = viem;
  const client = createPublicClient({ chain: { id: 998 }, transport: http(RPC) });

  const vaultAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
  );
  const adapterAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/ProjectXAdapter.json"), "utf8")
  );
  const erc20Abi = [
    { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  ];
  const airdropAbi = [
    { name: "merkleRoot", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  ];

  const checks = [];

  async function hasCode(label, address) {
    if (!address) {
      checks.push({ label: `${label} bytecode`, ok: false, detail: "address missing" });
      return false;
    }
    const code = await client.getBytecode({ address });
    const ok = code && code !== "0x";
    checks.push({ label: `${label} bytecode`, ok, detail: address });
    return ok;
  }

  await hasCode("Oracle", d.oracle);
  await hasCode("Adapter", adapter);
  await hasCode("Vault", vault);
  await hasCode("Airdrop", d.airdrop);
  if (d.projectXNpm) await hasCode("ProjectX NPM", d.projectXNpm);
  if (d.referralRegistry) {
    await hasCode("ReferralRegistry", d.referralRegistry);
  } else {
    checks.push({
      label: "ReferralRegistry configured",
      ok: false,
      optional: true,
      detail: "missing — run: forge script script/DeployReferral.s.sol && node scripts/finalize-referral.mjs 998",
    });
  }

  const [swapRouter, convertEnabled, operatorBps] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: "swapRouter" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "convertHypeFeesToUsdc" }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "operatorFeeBps" }),
  ]);

  if (swapRouter && swapRouter !== "0x0000000000000000000000000000000000000000") {
    checks.push({ label: "Vault swapRouter configured", ok: true, detail: swapRouter });
  } else {
    checks.push({ label: "Vault swapRouter configured", ok: false, detail: "not set" });
  }
  checks.push({
    label: "convertHypeFeesToUsdc",
    ok: convertEnabled === true,
    detail: String(convertEnabled),
  });
  checks.push({
    label: "operatorFeeBps",
    ok: operatorBps === 3300n,
    detail: String(operatorBps),
  });

  const totalAssets = await client.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalAssetsUsdc",
  });
  checks.push({
    label: "Vault totalAssetsUsdc readable",
    ok: totalAssets >= 0n,
    detail: `${formatUnits(totalAssets, 6)} USDC (NAV)`,
  });

  if (adapter) {
    const positionId = await client.readContract({
      address: adapter,
      abi: adapterAbi,
      functionName: "positionTokenId",
    });
    const hasPosition = positionId > 0n;
    checks.push({
      label: "Adapter LP position minted",
      ok: hasPosition,
      detail: hasPosition ? `tokenId ${positionId}` : "none — run testnet-post-deploy.mjs",
    });
  }

  const merkleRoot = await client.readContract({ address: d.airdrop, abi: airdropAbi, functionName: "merkleRoot" });
  const rootOk = merkleRoot !== `0x${"0".repeat(64)}`;
  checks.push({ label: "Merkle root set", ok: rootOk, detail: String(merkleRoot) });

  if (d.airdropEntries?.length) {
    const airdropBal = await client.readContract({
      address: d.tokenUSDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [d.airdrop],
    });
    const claimTotal = d.airdropEntries.reduce((s, e) => s + BigInt(e.amount), 0n);
    const fundOk = airdropBal >= claimTotal;
    checks.push({
      label: "Airdrop USDC >= claim total",
      ok: fundOk,
      optional: !fundOk,
      detail: `contract ${formatUnits(airdropBal, 6)} USDC, claims need ${formatUnits(claimTotal, 6)}`,
    });
  }

  console.log("==> Testnet verify (chain 998)");
  console.log(`    RPC: ${RPC}`);
  console.log(`    Vault: ${vault}`);
  console.log(`    Adapter: ${adapter ?? "n/a"}`);
  console.log("");

  let failed = 0;
  let warned = 0;
  for (const c of checks) {
    const mark = c.ok ? "✓" : c.optional ? "⚠" : "✗";
    console.log(`${mark} ${c.label}: ${c.detail}`);
    if (!c.ok && c.optional) warned++;
    else if (!c.ok) failed++;
  }

  console.log("");
  if (failed > 0) {
    console.log(`FAILED: ${failed} check(s). Seed vault: node scripts/testnet-post-deploy.mjs`);
    process.exit(1);
  }
  if (warned > 0) {
    console.log(`All required checks passed (${warned} optional warning(s)).`);
    console.log("Fund cashdrop: bridge USDC then node scripts/testnet-fund-airdrop.mjs");
  } else {
    console.log("All checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
