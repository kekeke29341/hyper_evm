import type { Address } from "viem";
import type { Deployment } from "@/lib/contracts";
import { buildCashdropEntries, type ReferrerLookup } from "@/lib/referral/allocation";
import { sumEligibleShares } from "@/lib/referral/earnings";

function entryAmount(
  entries: ReturnType<typeof buildCashdropEntries>,
  address: Address
): bigint {
  const key = address.toLowerCase();
  return entries.find((e) => e.address.toLowerCase() === key)?.amount ?? 0n;
}

/**
 * Referrer commission attributable to a single referee (delta when that binding is removed).
 */
export function computeCommissionFromReferee(params: {
  referee: Address;
  referrer: Address;
  deployment: Deployment;
  referrers: ReferrerLookup;
}): bigint {
  const { referee, referrer, deployment, referrers } = params;
  const holders = deployment.vaultShareHolders;
  const pool = deployment.airdropEntries?.reduce((s, e) => s + BigInt(e.amount), 0n) ?? 0n;
  if (!holders?.length || pool === 0n) return 0n;

  const refereeKey = referee.toLowerCase();
  if (referrers.get(refereeKey)?.toLowerCase() !== referrer.toLowerCase()) return 0n;

  const totalShares = sumEligibleShares(holders);
  if (totalShares === 0n) return 0n;

  const shareHolders = holders.map((h) => ({
    address: h.address as Address,
    shares: BigInt(h.shares),
  }));

  const withAll = buildCashdropEntries({
    holders: shareHolders,
    pending: pool,
    totalShares,
    referrers,
  });

  const withoutReferee = new Map(referrers);
  withoutReferee.delete(refereeKey);

  const withoutMe = buildCashdropEntries({
    holders: shareHolders,
    pending: pool,
    totalShares,
    referrers: withoutReferee,
  });

  const allAmt = entryAmount(withAll, referrer);
  const withoutAmt = entryAmount(withoutMe, referrer);
  return allAmt > withoutAmt ? allAmt - withoutAmt : 0n;
}
