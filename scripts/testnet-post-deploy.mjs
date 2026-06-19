#!/usr/bin/env node
/**
 * Post-deploy testnet setup: bridge USDC, wrap HYPE, seed LP, configure airdrop.
 * Usage: node scripts/testnet-post-deploy.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const RPC = process.env.TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet";
const HYPE_SYSTEM = "0x2222222222222222222222222222222222222222";
const USDC_SYSTEM = "0x2000000000000000000000000000000000000000";
const WHYPE = "0x5555555555555555555555555555555555555555";
const USDC_TOKEN = "USDC:0xeb62eee3685fc4c43992febcd9e75443";

const BRIDGE_USDC = process.env.BRIDGE_USDC ?? "12";
const WRAP_HYPE = process.env.WRAP_HYPE ?? "0.15";
const LP_USDC = process.env.LP_USDC ?? "10";
const LP_WHYPE = process.env.LP_WHYPE ?? "0.15";
const VAULT_DEPOSIT_USDC = process.env.VAULT_DEPOSIT_USDC ?? LP_USDC;
const VAULT_DEPOSIT_HYPE = process.env.VAULT_DEPOSIT_HYPE ?? LP_WHYPE;
const SKIP_AIRDROP = process.env.SKIP_AIRDROP === "1";

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

async function hlImport(subpath) {
  return import(pathToFileURL(path.join(root, "frontend/node_modules/@nktkas/hyperliquid/esm", subpath)).href);
}

async function viemImport(subpath) {
  return import(pathToFileURL(path.join(root, "frontend/node_modules/viem/_esm", subpath)).href);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeLeaf(address, amount, { keccak256, encodeAbiParameters, concat, getAddress }) {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { name: "account", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      [getAddress(address), amount]
    )
  );
  return keccak256(concat([inner]));
}

function sortPair(a, b) {
  return a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
}

function buildMerkleRoot(entries, viem) {
  const { keccak256, encodeAbiParameters, concat, getAddress } = viem;
  let layer = entries.map((e) => makeLeaf(e.address, e.amount, { keccak256, encodeAbiParameters, concat, getAddress }));
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        const [x, y] = sortPair(layer[i], layer[i + 1]);
        next.push(keccak256(concat([x, y])));
      } else next.push(layer[i]);
    }
    layer = next;
  }
  return layer[0];
}

async function waitBalance(publicClient, token, account, min, decimals, { parseUnits }) {
  const abi = [
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "a", type: "address" }],
      outputs: [{ type: "uint256" }],
    },
  ];
  const minWei = parseUnits(min, decimals);
  for (let i = 0; i < 25; i++) {
    const bal = await publicClient.readContract({ address: token, abi, functionName: "balanceOf", args: [account] });
    if (bal >= minWei) return bal;
    await sleep(4000);
  }
  return publicClient.readContract({ address: token, abi, functionName: "balanceOf", args: [account] });
}

async function main() {
  loadEnv();
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Set MAIN_PRIVATE_KEY in .env.testnet");

  const deployPath = path.join(root, "contracts/deployments/998.json");
  const deployment = JSON.parse(fs.readFileSync(deployPath, "utf8"));
  if (!deployment.deployed) throw new Error("998.json not deployed");

  const viem = await viemImport("index.js");
  const { privateKeyToAccount } = await viemImport("accounts/index.js");
  const { createPublicClient, createWalletClient, http, parseUnits, parseEther } = viem;

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

  console.log("==> Testnet post-deploy setup");
  console.log(`    Wallet: ${account.address}`);
  console.log(`    Vault: ${deployment.hyperpoolVault ?? deployment.liquidityVault}`);

  const erc20BalanceAbi = [
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "a", type: "address" }],
      outputs: [{ type: "uint256" }],
    },
  ];

  const lpUsdcMin = parseUnits(LP_USDC, 6);
  const vaultUsdcAmt = parseUnits(VAULT_DEPOSIT_USDC, 6);
  let evmUsdc = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: [account.address],
  });

  if (lpUsdcMin === 0n || evmUsdc >= lpUsdcMin) {
    console.log(`\n[1/4] EVM USDC sufficient (${evmUsdc}), skipping spot bridge`);
  } else {
    console.log(`\n[1/4] spotSend ${BRIDGE_USDC} USDC → HyperEVM...`);
    const { HttpTransport } = await hlImport("transport/http/mod.js");
    const { spotSend } = await hlImport("api/exchange/mod.js");
    const transportHl = new HttpTransport({ isTestnet: true });
    try {
      await spotSend({ transport: transportHl, wallet: account }, {
        destination: USDC_SYSTEM,
        token: USDC_TOKEN,
        amount: BRIDGE_USDC,
      });
      console.log("    ✓ USDC bridged");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `spotSend failed (${msg}). Need spot USDC — try: node scripts/testnet-bootstrap.mjs (claimDrip) or reduce BRIDGE_USDC (spot balance ~8 USDC).`
      );
    }

    console.log("    waiting for EVM USDC...");
    evmUsdc = await waitBalance(publicClient, deployment.tokenUSDC, account.address, LP_USDC, 6, viem);
    console.log(`    EVM USDC: ${evmUsdc}`);
  }

  // 2. Wrap HYPE → WHYPE (for vault deposit)
  const hypeAmt = parseEther(VAULT_DEPOSIT_HYPE);
  if (hypeAmt > 0n) {
    console.log(`\n[2/4] Wrap ${VAULT_DEPOSIT_HYPE} HYPE → WHYPE...`);
    const wrapHash = await walletClient.writeContract({
      address: WHYPE,
      abi: [{ name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] }],
      functionName: "deposit",
      value: hypeAmt,
    });
    await publicClient.waitForTransactionReceipt({ hash: wrapHash });
    console.log("    ✓ wrapped");
  } else {
    console.log("\n[2/4] Wrap — skipped (VAULT_DEPOSIT_HYPE=0)");
  }

  // 3. Deposit into HyperpoolVault (USDC + HYPE)
  const vault = deployment.hyperpoolVault ?? deployment.liquidityVault;
  if (!vault) throw new Error("hyperpoolVault missing in deployment JSON");

  const erc20Abi = [
    { name: "approve", type: "function", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  ];
  const vaultAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/HyperpoolVault.json"), "utf8")
  );

  console.log(`\n[3/4] Vault deposit ${VAULT_DEPOSIT_USDC} USDC...`);
  if (vaultUsdcAmt === 0n) {
    console.log("    – skipped (VAULT_DEPOSIT_USDC=0)");
  } else if (evmUsdc < vaultUsdcAmt) {
    console.log(`    ⚠ insufficient EVM USDC (${evmUsdc}) — skipping USDC deposit`);
  } else {
    const apprUsdc = await walletClient.writeContract({
      address: deployment.tokenUSDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, vaultUsdcAmt],
    });
    await publicClient.waitForTransactionReceipt({ hash: apprUsdc });

    const depUsdcHash = await walletClient.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "depositUSDC",
      args: [vaultUsdcAmt, account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: depUsdcHash });
    console.log("    ✓ USDC deposited");
  }

  console.log(`\n    Vault deposit ${VAULT_DEPOSIT_HYPE} WHYPE via depositHYPE...`);
  if (hypeAmt > 0n) {
    const apprHype = await walletClient.writeContract({
      address: WHYPE,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, hypeAmt],
    });
    await publicClient.waitForTransactionReceipt({ hash: apprHype });

    const depHypeHash = await walletClient.writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "depositHYPE",
      args: [hypeAmt, account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: depHypeHash });
    console.log("    ✓ HYPE deposited");
  } else {
    console.log("    – skipped (VAULT_DEPOSIT_HYPE=0)");
  }

  const shares = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`    Vault shares: ${shares}`);

  // 4. Airdrop merkle + fund
  if (SKIP_AIRDROP) {
    console.log("\n[4/4] Configure MerkleAirdrop — skipped (SKIP_AIRDROP=1)");
    console.log("\n==> Post-deploy complete");
    console.log(`    Vault: ${vault}`);
    console.log(`    Vault shares: ${shares}`);
  } else {
  console.log("\n[4/4] Configure MerkleAirdrop...");
  const entries = [{ address: account.address, amount: parseUnits("100", 6) }];
  const merkleRoot = buildMerkleRoot(entries, viem);
  const claimDeadline = BigInt(Math.floor(Date.now() / 1000) + 90 * 86400);
  const airdropAbi = JSON.parse(
    fs.readFileSync(path.join(root, "frontend/src/lib/contracts/abis/MerkleAirdrop.json"), "utf8")
  );

  const rootHash = await walletClient.writeContract({
    address: deployment.airdrop,
    abi: airdropAbi,
    functionName: "setMerkleRoot",
    args: [merkleRoot, claimDeadline],
  });
  await publicClient.waitForTransactionReceipt({ hash: rootHash });
  console.log("    ✓ setMerkleRoot");

  const fundTarget = parseUnits(process.env.AIRDROP_FUND_USDC ?? "100", 6);
  const avail = await publicClient.readContract({
    address: deployment.tokenUSDC,
    abi: [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }],
    functionName: "balanceOf",
    args: [account.address],
  });
  const fund = avail < fundTarget ? avail : fundTarget;
  if (fund === 0n) {
    console.log("    ⚠ No USDC for airdrop — run: node scripts/testnet-fund-airdrop.mjs");
  } else {
    const appr = await walletClient.writeContract({
      address: deployment.tokenUSDC,
      abi: erc20Abi,
      functionName: "approve",
      args: [deployment.airdrop, fund],
    });
    await publicClient.waitForTransactionReceipt({ hash: appr });
    const fundHash = await walletClient.writeContract({
      address: deployment.airdrop,
      abi: airdropAbi,
      functionName: "fund",
      args: [fund],
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
    console.log(`    ✓ funded ${fund} USDC (6 dec)`);
  }

  deployment.airdropEntries = entries.map((e) => ({
    address: e.address,
    amount: e.amount.toString(),
  }));
  deployment.merkleRoot = merkleRoot;
  deployment.vaultShareHolders = [{ address: account.address, shares: shares.toString() }];

  for (const p of [
    path.join(root, "contracts/deployments/998.json"),
    path.join(root, "frontend/src/lib/contracts/deployments/998.json"),
  ]) {
    fs.writeFileSync(p, JSON.stringify(deployment, null, 2) + "\n");
  }

  console.log("\n==> Testnet ready for vault ops + cashdrop");
  console.log(`    Vault: ${vault}`);
  console.log(`    Claimable: ${account.address} — 100 USDC`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
