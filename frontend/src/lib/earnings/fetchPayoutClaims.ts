import { decodeEventLog, formatUnits, type Address, type PublicClient } from "viem";
import type { Deployment } from "@/lib/contracts";
import { deploymentPayoutClaims } from "./deploymentPayouts";
import { claimedEvent, distributedEvent, fetchOnChainEarningsClaims } from "./onChain";
import { mergeEarningsClaims, type EarningsClaim } from "./history";

async function fetchClaimsFromTxReceipt(
  publicClient: PublicClient,
  airdropAddress: Address,
  account: Address,
  txHash: `0x${string}`
): Promise<EarningsClaim[]> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return [];

  const accountLower = account.toLowerCase();
  const claims: EarningsClaim[] = [];
  let blockTsMs: number | undefined;

  for (const log of receipt.logs) {
    if (log.address?.toLowerCase() !== airdropAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: [claimedEvent, distributedEvent],
        data: log.data,
        topics: log.topics,
      });
      const decodedAccount = (decoded.args as { account?: Address }).account?.toLowerCase();
      if (decodedAccount !== accountLower) continue;
      const amount = (decoded.args as { amount?: bigint }).amount;
      if (amount == null) continue;

      if (blockTsMs === undefined && receipt.blockNumber != null) {
        const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
        blockTsMs = Number(block.timestamp) * 1000;
      }

      claims.push({
        t: blockTsMs ?? Date.now(),
        usdc: parseFloat(formatUnits(amount, 6)),
        txHash,
      });
    } catch {
      // Not a Cashdrop payout event.
    }
  }

  return claims;
}

export async function fetchPayoutClaims(params: {
  publicClient: PublicClient;
  deployment: Deployment;
  chainId: number;
  userAddress: Address;
}): Promise<EarningsClaim[]> {
  const { publicClient, deployment, chainId, userAddress } = params;
  const fromDeployment = deploymentPayoutClaims(deployment, userAddress);

  const txHash = deployment.lastCashdropDistribution?.txHash as `0x${string}` | undefined;
  // Receipt verification is best-effort — a rate-limited RPC must not blank out
  // the history already recorded in the deployment JSON.
  const fromReceipt =
    txHash != null
      ? await fetchClaimsFromTxReceipt(publicClient, deployment.airdrop, userAddress, txHash).catch(
          () => []
        )
      : [];

  const known = mergeEarningsClaims(fromReceipt, fromDeployment);
  if (known.length > 0) return known;

  try {
    const onChain = await fetchOnChainEarningsClaims(
      publicClient,
      deployment.airdrop,
      userAddress,
      chainId
    );
    return mergeEarningsClaims(onChain, fromDeployment);
  } catch {
    return fromDeployment;
  }
}
