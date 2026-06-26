#!/usr/bin/env node
/**
 * Guard against stale deployment addresses in ops docs.
 *
 * - contracts/deployments/*.json must match frontend copies
 * - key ops docs must mention the current HyperpoolVault per chain
 * - known superseded vault addresses must not appear in ops docs
 *
 * Usage: node scripts/verify-doc-addresses.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const CHAINS = [998, 999];
const DOCS_FOR_CHAIN = {
  998: [
    "docs/本番運用/テストネット運用.md",
    "docs/本番運用/チェックリスト.md",
    "docs/本番運用/検証手順.md",
    "docs/本番運用/運営確認事項.md",
  ],
  999: ["docs/本番運用/チェックリスト.md", "docs/本番運用/運営確認事項.md"],
};

const STALE_SCAN_DOCS = [
  "docs/本番運用/テストネット運用.md",
  "docs/本番運用/チェックリスト.md",
  "docs/本番運用/検証手順.md",
];

/** Vault addresses from older Testnet redeploys — must not remain in ops docs. */
const STALE_VAULTS = [
  "0x4b92c8ce7b2be93f32054aa8d60a9385e55ffb43",
  "0xebbe06612b584de0e0e7897afdbcfc2c3f069b34",
  "0xdec7711864c64d6d98ab61e5e28d1a2fd76f9c87",
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function norm(addr) {
  return addr?.toLowerCase?.() ?? "";
}

function main() {
  const errors = [];

  for (const chain of CHAINS) {
    const contractsPath = `contracts/deployments/${chain}.json`;
    const frontendPath = `frontend/src/lib/contracts/deployments/${chain}.json`;
    const contracts = readJson(contractsPath);
    const frontend = readJson(frontendPath);

    const keys = new Set([...Object.keys(contracts), ...Object.keys(frontend)]);
    for (const key of keys) {
      const a = contracts[key];
      const b = frontend[key];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        errors.push(`${contractsPath} vs ${frontendPath}: field "${key}" differs`);
      }
    }

    if (!contracts.deployed) continue;
    const vault = contracts.hyperpoolVault ?? contracts.liquidityVault;
    if (!vault) {
      errors.push(`${contractsPath}: hyperpoolVault missing`);
      continue;
    }

    for (const docRel of DOCS_FOR_CHAIN[chain] ?? []) {
      const docPath = path.join(root, docRel);
      if (!fs.existsSync(docPath)) {
        errors.push(`Missing ops doc: ${docRel}`);
        continue;
      }
      const text = fs.readFileSync(docPath, "utf8");
      if (!text.toLowerCase().includes(norm(vault))) {
        errors.push(`${docRel}: missing current chain ${chain} vault ${vault}`);
      }
    }
  }

  for (const docRel of STALE_SCAN_DOCS) {
    const docPath = path.join(root, docRel);
    if (!fs.existsSync(docPath)) continue;
    const text = fs.readFileSync(docPath, "utf8");
    for (const stale of STALE_VAULTS) {
      if (text.toLowerCase().includes(stale.toLowerCase())) {
        errors.push(`${docRel}: contains stale vault address ${stale}`);
      }
    }
  }

  if (errors.length) {
    console.error("verify-doc-addresses: FAILED\n");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log("verify-doc-addresses: OK (deployment JSON synced; ops docs contain current vault addresses)");
}

main();
