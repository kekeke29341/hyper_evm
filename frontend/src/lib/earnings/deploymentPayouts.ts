import type { Deployment } from "@/lib/contracts";
import type { EarningsClaim } from "./history";

/** Cashdrop amounts baked into deployment JSON after daily-rewards runs. */
export function deploymentPayoutClaims(
  deployment: Deployment | null | undefined,
  address: string | undefined
): EarningsClaim[] {
  if (!deployment?.airdropEntries?.length || !deployment.lastCashdropDistribution || !address) {
    return [];
  }

  const entry = deployment.airdropEntries.find(
    (e) => e.address.toLowerCase() === address.toLowerCase()
  );
  if (!entry) return [];

  const amount = Number(BigInt(entry.amount)) / 1_000_000;
  if (!Number.isFinite(amount) || amount <= 0) return [];

  const executedAt = Date.parse(deployment.lastCashdropDistribution.executedAt);
  if (!Number.isFinite(executedAt)) return [];

  return [
    {
      t: executedAt,
      usdc: amount,
      txHash: deployment.lastCashdropDistribution.txHash,
    },
  ];
}

export function formatUsdcDisplay(usdc: number): string {
  if (!Number.isFinite(usdc) || usdc <= 0) return "0.00";
  if (usdc < 0.01) return usdc.toFixed(6);
  if (usdc < 1) return usdc.toFixed(4);
  return usdc.toFixed(2);
}
