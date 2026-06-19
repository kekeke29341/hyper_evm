#!/usr/bin/env node
/**
 * RPC-level testnet smoke — HyperpoolVault + ProjectXAdapter (no browser).
 * Usage: source ../../scripts/testnet-env.sh && npm run verify:testnet
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const CHAIN_ID = 998;

const pkRaw = process.env.PRIVATE_KEY ?? process.env.MAIN_PRIVATE_KEY;
if (!pkRaw) {
  console.error("Missing PRIVATE_KEY or MAIN_PRIVATE_KEY in env");
  process.exit(1);
}
const privateKey = pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`;
const account = privateKeyToAccount(privateKey);

const d = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/998.json"), "utf8"));
const Vault = d.hyperpoolVault ?? d.liquidityVault;
const Adapter = d.projectXAdapter;
const MerkleAirdrop = d.airdrop;
const WHYPE = d.tokenKHYPE;
const USDC = d.tokenUSDC;

const hyperEvmTestnet = {
  id: CHAIN_ID,
  name: "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

const publicClient = createPublicClient({ chain: hyperEvmTestnet, transport: http(RPC) });

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const vaultAbi = parseAbi([
  "function totalAssetsUsdc() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function paused() view returns (bool)",
]);

const adapterAbi = parseAbi([
  "function positionTokenId() view returns (uint256)",
  "function refPriceUsdc6PerHype18() view returns (uint256)",
]);

const merkleAbi = parseAbi([
  "function claimed(address) view returns (bool)",
  "function merkleRoot() view returns (bytes32)",
]);

function ok(label, detail) {
  console.log(`✓ ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, err) {
  console.error(`✗ ${label}: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
}

async function main() {
  console.log(`==> Testnet on-chain verify (chain ${CHAIN_ID})`);
  console.log(`    RPC: ${RPC}`);
  console.log(`    Wallet: ${account.address}`);

  const block = await publicClient.getBlockNumber().catch((e) => {
    fail("RPC reachable", e);
    return 0n;
  });
  if (block > 0n) ok("RPC reachable", `block ${block}`);

  for (const [name, addr] of Object.entries({
    Vault,
    Adapter,
    Oracle: d.oracle,
    MerkleAirdrop,
    WHYPE,
    USDC,
  })) {
    if (!addr) {
      fail(`${name} address`, "missing in 998.json");
      continue;
    }
    const code = await publicClient.getBytecode({ address: addr }).catch(() => undefined);
    if (code && code !== "0x") ok(`${name} deployed`, addr);
    else fail(`${name} deployed`, addr);
  }

  const hypeBal = await publicClient.getBalance({ address: account.address });
  ok("HYPE balance", formatEther(hypeBal));

  for (const [sym, token] of [
    ["WHYPE", WHYPE],
    ["USDC", USDC],
  ]) {
    const bal = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    const dec = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    });
    ok(`${sym} balance`, formatUnits(bal, dec));
  }

  const nav = await publicClient.readContract({
    address: Vault,
    abi: vaultAbi,
    functionName: "totalAssetsUsdc",
  });
  ok("Vault NAV (totalAssetsUsdc)", `${formatUnits(nav, 6)} USDC`);

  const shares = await publicClient.readContract({
    address: Vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const supply = await publicClient.readContract({
    address: Vault,
    abi: vaultAbi,
    functionName: "totalSupply",
  });
  ok("Vault shares (wallet / total)", `${shares} / ${supply}`);

  const paused = await publicClient.readContract({
    address: Vault,
    abi: vaultAbi,
    functionName: "paused",
  });
  ok("Vault paused", paused ? "yes" : "no");

  if (Adapter) {
    const positionId = await publicClient.readContract({
      address: Adapter,
      abi: adapterAbi,
      functionName: "positionTokenId",
    });
    const refPrice = await publicClient.readContract({
      address: Adapter,
      abi: adapterAbi,
      functionName: "refPriceUsdc6PerHype18",
    });
    ok("Adapter LP position", positionId > 0n ? `tokenId ${positionId}` : "none");
    ok("Adapter ref price", `${formatUnits(refPrice, 6)} USDC/HYPE`);
  }

  const root = await publicClient.readContract({
    address: MerkleAirdrop,
    abi: merkleAbi,
    functionName: "merkleRoot",
  });
  const claimed = await publicClient.readContract({
    address: MerkleAirdrop,
    abi: merkleAbi,
    functionName: "claimed",
    args: [account.address],
  });
  ok("Cashdrop merkle root set", root);
  ok("Cashdrop claimed (wallet)", claimed ? "yes" : "no — eligible in UI");

  const airdropUsdc = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [MerkleAirdrop],
  });
  if (d.airdropEntries?.length) {
    const need = d.airdropEntries.reduce((s, e) => s + BigInt(e.amount), 0n);
    if (airdropUsdc >= need) ok("Cashdrop funded", `${formatUnits(airdropUsdc, 6)} USDC`);
    else ok("Cashdrop funded", `⚠ ${formatUnits(airdropUsdc, 6)} / ${formatUnits(need, 6)} USDC — run testnet-fund-airdrop.mjs`);
  }

  if (shares > 0n) {
    ok("Withdraw ready", "wallet holds vault shares");
  } else {
    ok("Withdraw ready", "no shares — deposit via UI or testnet-post-deploy.mjs");
  }

  console.log("\nDone.");
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
