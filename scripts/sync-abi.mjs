#!/usr/bin/env node
/**
 * Sync Foundry artifacts → frontend/lib/contracts
 * Usage: node scripts/sync-abi.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "contracts/out");
const abiDir = path.join(root, "frontend/src/lib/contracts/abis");
const deploySrc = path.join(root, "contracts/deployments");
const deployDst = path.join(root, "frontend/src/lib/contracts/deployments");

const CONTRACTS = [
  { file: "ProjectXRouter.sol/ProjectXRouter.json", name: "ProjectXRouter" },
  { file: "ProjectXFactory.sol/ProjectXFactory.json", name: "ProjectXFactory" },
  { file: "ProjectXPair.sol/ProjectXPair.json", name: "ProjectXPair" },
  { file: "MockERC20.sol/MockERC20.json", name: "MockERC20" },
  { file: "PointsDistributor.sol/PointsDistributor.json", name: "PointsDistributor" },
  { file: "ReferralRegistry.sol/ReferralRegistry.json", name: "ReferralRegistry" },
  { file: "MerkleAirdrop.sol/MerkleAirdrop.json", name: "MerkleAirdrop" },
  { file: "HyperCoreOracle.sol/HyperCoreOracle.json", name: "HyperCoreOracle" },
  { file: "HyperpoolLiquidityVault.sol/HyperpoolLiquidityVault.json", name: "HyperpoolLiquidityVault" },
];

fs.mkdirSync(abiDir, { recursive: true });
fs.mkdirSync(deployDst, { recursive: true });

for (const { file, name } of CONTRACTS) {
  const src = path.join(outDir, file);
  if (!fs.existsSync(src)) {
    console.warn(`Skip ${name}: ${src} not found (run forge build first)`);
    continue;
  }
  const artifact = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.writeFileSync(path.join(abiDir, `${name}.json`), JSON.stringify(artifact.abi, null, 2));
  console.log(`Synced ABI: ${name}`);
}

if (fs.existsSync(deploySrc)) {
  for (const f of fs.readdirSync(deploySrc).filter((f) => f.endsWith(".json"))) {
    fs.copyFileSync(path.join(deploySrc, f), path.join(deployDst, f));
    console.log(`Synced deployment: ${f}`);
  }
}

console.log("Done.");
