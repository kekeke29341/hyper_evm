import type { Address } from "viem";
import { VAULT_DEAD_SHARE_ADDRESS } from "@/lib/constants";
import type { Deployment } from "@/lib/contracts";
import { buildCashdropEntries, type ReferrerLookup } from "@/lib/referral/allocation";

export function sumEligibleShares(
  holders: { address: Address; shares: string }[] | undefined
): bigint {
  if (!holders?.length) return 0n;
  const dead = VAULT_DEAD_SHARE_ADDRESS.toLowerCase();
  return holders.reduce((sum, h) => {
    if (h.address.toLowerCase() === dead) return sum;
    return sum + BigInt(h.shares);
  }, 0n);
}

export function cashdropPoolFromEntries(
  entries: { amount: string }[] | undefined
): bigint {
  if (!entries?.length) return 0n;
  return entries.reduce((sum, e) => sum + BigInt(e.amount), 0n);
}

/**
 * Referrer commission for the current Merkle round (difference vs no-referral allocation).
 */
export function computeReferrerCommission(params: {
  address: Address;
  deployment: Deployment;
  referrers: ReferrerLookup;
}): bigint {
  const { address, deployment, referrers } = params;
  const holders = deployment.vaultShareHolders;
  const pool = cashdropPoolFromEntries(deployment.airdropEntries);
  if (!holders?.length || pool === 0n) return 0n;

  const totalShares = sumEligibleShares(holders);
  if (totalShares === 0n) return 0n;

  const shareHolders = holders.map((h) => ({
    address: h.address as Address,
    shares: BigInt(h.shares),
  }));

  const without = buildCashdropEntries({
    holders: shareHolders,
    pending: pool,
    totalShares,
    referrers: new Map(),
  });
  const withRef = buildCashdropEntries({
    holders: shareHolders,
    pending: pool,
    totalShares,
    referrers,
  });

  const key = address.toLowerCase();
  const base = without.find((e) => e.address.toLowerCase() === key)?.amount ?? 0n;
  const total = withRef.find((e) => e.address.toLowerCase() === key)?.amount ?? 0n;
  return total > base ? total - base : 0n;
}
