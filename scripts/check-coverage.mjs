#!/usr/bin/env node
/**
 * Parse forge coverage summary and enforce minimum branch coverage.
 * Usage: node scripts/check-coverage.mjs [minBranchPercent]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const minBranch = Number(process.argv[2] ?? process.env.MIN_BRANCH_COVERAGE ?? "17");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = path.join(root, "contracts");

const result = spawnSync("forge", ["coverage", "--ir-minimum", "--report", "summary"], {
  cwd: contractsDir,
  encoding: "utf8",
  env: { ...process.env, FOUNDRY_PROFILE: process.env.FOUNDRY_PROFILE ?? "ci" },
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const totalLine = result.stdout
  .split("\n")
  .find((line) => line.includes("| Total") && line.includes("%"));

if (!totalLine) {
  console.error("Could not parse forge coverage output");
  process.exit(1);
}

const cells = totalLine.split("|").map((s) => s.trim()).filter(Boolean);
// Line | % | % | % branches | % ...
const branchCell = cells[3] ?? "";
const branchPct = Number.parseFloat(branchCell.split("%")[0]);

if (Number.isNaN(branchPct)) {
  console.error("Could not parse branch coverage from:", branchCell);
  process.exit(1);
}

console.log(`Branch coverage: ${branchPct}% (minimum ${minBranch}%)`);

if (branchPct < minBranch) {
  console.error(`Branch coverage ${branchPct}% is below minimum ${minBranch}%`);
  process.exit(1);
}
