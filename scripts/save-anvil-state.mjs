#!/usr/bin/env node
/**
 * Save Anvil state after deploy for faster restarts.
 * Usage: node scripts/save-anvil-state.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const outPath = path.join(root, "contracts/anvil-state.json");

const res = await fetch(RPC, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "anvil_dumpState", params: [], id: 1 }),
});
const json = await res.json();
if (json.error) {
  console.error("dumpState failed:", json.error);
  process.exit(1);
}

// Foundry returns hex-encoded gzip JSON
const hex = json.result.startsWith("0x") ? json.result.slice(2) : json.result;
const buf = Buffer.from(hex, "hex");
fs.writeFileSync(outPath, buf);
console.log(`Saved Anvil state → ${outPath} (${buf.length} bytes)`);
