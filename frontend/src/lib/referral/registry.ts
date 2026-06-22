import type { Address, PublicClient } from "viem";
import type { ReferrerLookup } from "@/lib/referral/allocation";

const ZERO = "0x0000000000000000000000000000000000000000";

const getReferrerAbi = [
  {
    type: "function",
    name: "getReferrer",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export async function fetchReferrerMap(
  publicClient: PublicClient,
  registryAddress: Address,
  holders: { address: Address }[]
): Promise<ReferrerLookup> {
  const map: ReferrerLookup = new Map();
  if (!registryAddress || registryAddress.toLowerCase() === ZERO) return map;

  for (const holder of holders) {
    const referrer = await publicClient.readContract({
      address: registryAddress,
      abi: getReferrerAbi,
      functionName: "getReferrer",
      args: [holder.address],
    });
    if (referrer && referrer.toLowerCase() !== ZERO) {
      map.set(holder.address.toLowerCase(), referrer);
    }
  }

  return map;
}
