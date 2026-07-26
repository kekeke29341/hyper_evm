import type { Deployment } from "@/lib/contracts";
import type { EarningsClaim } from "./history";

function toClaim(
  executedAt: string,
  txHash: string,
  rawAmount: string
): EarningsClaim | null {
  let amount: number;
  try {
    amount = Number(BigInt(rawAmount)) / 1_000_000;
  } catch {
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const t = Date.parse(executedAt);
  if (!Number.isFinite(t)) return null;
  return { t, usdc: amount, txHash };
}

/** Cashdrop amounts baked into deployment JSON after daily-rewards runs. */
export function deploymentPayoutClaims(
  deployment: Deployment | null | undefined,
  address: string | undefined
): EarningsClaim[] {
  if (!deployment || !address) return [];
  const addressLower = address.toLowerCase();
  const claims: EarningsClaim[] = [];

  for (const dist of deployment.cashdropDistributionHistory ?? []) {
    const entry = dist.entries?.find((e) => e.address.toLowerCase() === addressLower);
    if (!entry) continue;
    const claim = toClaim(dist.executedAt, dist.txHash, entry.amount);
    if (claim) claims.push(claim);
  }

  const last = deployment.lastCashdropDistribution;
  const lastEntry = deployment.airdropEntries?.find(
    (e) => e.address.toLowerCase() === addressLower
  );
  if (last && lastEntry && !claims.some((c) => c.txHash === last.txHash)) {
    const claim = toClaim(last.executedAt, last.txHash, lastEntry.amount);
    if (claim) claims.push(claim);
  }

  return claims.sort((a, b) => a.t - b.t);
}

export function formatUsdcDisplay(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) return "0.00";
  if (usdc < 0.01) return usdc.toFixed(6);
  if (usdc < 1) return usdc.toFixed(4);
  return usdc.toFixed(2);
}
