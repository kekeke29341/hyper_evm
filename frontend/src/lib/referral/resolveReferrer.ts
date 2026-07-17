import type { Address, PublicClient } from "viem";
import { getAddress } from "viem";
import { loadPendingReferrerAddress } from "@/lib/referral/codeStorage";

export type ReferrerResolution =
  | { kind: "referrer"; referrer: Address }
  | { kind: "invalid" };

export async function fetchIsRegisteredReferrer(
  publicClient: PublicClient,
  registry: Address,
  referrer: Address
): Promise<boolean> {
  return publicClient.readContract({
    address: registry,
    abi: [
      {
        type: "function",
        name: "isRegisteredReferrer",
        stateMutability: "view",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "bool" }],
      },
    ],
    functionName: "isRegisteredReferrer",
    args: [referrer],
  });
}

/** Resolve invite input or a pending ?referrer= link to a registered referrer address. */
export async function resolveReferrer(
  publicClient: PublicClient,
  registry: Address,
  inviteInput: string
): Promise<ReferrerResolution> {
  const candidates: Address[] = [];
  const trimmed = inviteInput.trim();
  if (trimmed) {
    try {
      candidates.push(getAddress(trimmed));
    } catch {
      // ignore malformed address input
    }
  }
  const pending = loadPendingReferrerAddress();
  if (pending && !candidates.some((a) => a.toLowerCase() === pending.toLowerCase())) {
    candidates.push(pending);
  }

  for (const referrer of candidates) {
    const registered = await fetchIsRegisteredReferrer(publicClient, registry, referrer);
    if (registered) return { kind: "referrer", referrer };
  }

  return { kind: "invalid" };
}
