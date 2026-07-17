import type { Address, PublicClient } from "viem";
import { getAddress, zeroAddress } from "viem";
import type { Deployment } from "@/lib/contracts";
import { abis, getVaultAddress } from "@/lib/contracts";
import {
  distributionPoolUsdc6,
  estimateUserPayoutUsdc6,
  transfersFromLogs,
  type CashdropEstimateSnapshot,
  weightedHoldersFromTransfers,
} from "@/lib/earnings/cashdropEstimate";
import { scanVaultTransferLogs } from "@/lib/earnings/vaultLogScan";
import type { ReferrerLookup } from "@/lib/referral/allocation";

const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;
const npmPositionsAbi = [
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

type WeightCheckpoint = {
  blockNumber?: string;
  timestamp?: string;
  balances?: Record<string, string>;
};

function vaultDeployBlock(chainId: number, deployment: Deployment): bigint {
  if (deployment.vaultDeployBlock) return BigInt(deployment.vaultDeployBlock);
  if (chainId === 999) return 39_115_156n;
  return 0n;
}

function resolveWeightingPeriod(
  chainId: number,
  deployment: Deployment,
  deployBlockTimestamp: number
): { fromBlock: bigint; periodStartTimestamp: number; initialBalances: Record<string, string> } {
  const checkpoint = (deployment as Deployment & { cashdropWeightCheckpoint?: WeightCheckpoint })
    .cashdropWeightCheckpoint;
  if (checkpoint?.blockNumber && checkpoint?.timestamp) {
    return {
      fromBlock: BigInt(checkpoint.blockNumber) + 1n,
      periodStartTimestamp: Number(checkpoint.timestamp),
      initialBalances: checkpoint.balances ?? {},
    };
  }

  const last = deployment.lastCashdropDistribution as
    | (Deployment["lastCashdropDistribution"] & { harvestBlock?: string; harvestTimestamp?: string })
    | undefined;
  if (last?.harvestBlock && last?.harvestTimestamp) {
    return {
      fromBlock: BigInt(last.harvestBlock) + 1n,
      periodStartTimestamp: Number(last.harvestTimestamp),
      initialBalances: checkpoint?.balances ?? {},
    };
  }
  if (last?.executedAt) {
    return {
      fromBlock: vaultDeployBlock(chainId, deployment),
      periodStartTimestamp: Math.floor(Date.parse(last.executedAt) / 1000),
      initialBalances: {},
    };
  }

  return {
    fromBlock: vaultDeployBlock(chainId, deployment),
    periodStartTimestamp: deployBlockTimestamp,
    initialBalances: {},
  };
}

async function hypeToUsdc6(
  publicClient: PublicClient,
  adapter: Address,
  hypeAmount: bigint
): Promise<bigint> {
  if (hypeAmount === 0n) return 0n;
  const price = (await publicClient.readContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "refPriceUsdc6PerHype18",
  })) as bigint;
  if (price === 0n) return 0n;
  return (hypeAmount * price) / 10n ** 30n;
}

async function readUncollectedGrossUsdc6(
  publicClient: PublicClient,
  deployment: Deployment
): Promise<bigint> {
  const adapter = deployment.projectXAdapter;
  const npm = deployment.projectXNpm;
  if (!adapter || !npm) return 0n;

  const positionTokenId = (await publicClient.readContract({
    address: adapter,
    abi: abis.adapter,
    functionName: "positionTokenId",
  })) as bigint;
  if (positionTokenId === 0n) return 0n;

  const position = (await publicClient.readContract({
    address: npm,
    abi: npmPositionsAbi,
    functionName: "positions",
    args: [positionTokenId],
  })) as readonly [
    bigint,
    Address,
    Address,
    Address,
    number,
    number,
    number,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];

  const token0 = position[2];
  const owed0 = position[10];
  const owed1 = position[11];
  const usdc = deployment.tokenUSDC.toLowerCase();

  let usdcAmt = 0n;
  let hypeAmt = 0n;
  if (token0.toLowerCase() === usdc) {
    usdcAmt = owed0;
    hypeAmt = owed1;
  } else {
    usdcAmt = owed1;
    hypeAmt = owed0;
  }

  return usdcAmt + (await hypeToUsdc6(publicClient, adapter, hypeAmt));
}

async function fetchReferrer(
  publicClient: PublicClient,
  registry: Address | undefined,
  userAddress: Address
): Promise<Address | undefined> {
  if (!registry || registry === zeroAddress) return undefined;
  const referrer = (await publicClient.readContract({
    address: registry,
    abi: abis.referral,
    functionName: "getReferrer",
    args: [userAddress],
  })) as Address;
  if (!referrer || referrer === zeroAddress) return undefined;
  return referrer;
}

export async function fetchCashdropEstimate(params: {
  publicClient: PublicClient;
  deployment: Deployment;
  chainId: number;
  userAddress: Address;
  rpcUrls?: string[];
  previousUncollectedGrossUsdc6?: bigint;
  previousSyncedAtMs?: number;
}): Promise<CashdropEstimateSnapshot | null> {
  const { publicClient, deployment, chainId, userAddress, rpcUrls } = params;
  const vault = getVaultAddress(deployment);
  if (!vault) return null;

  const latestBlock = await publicClient.getBlockNumber();
  const deployBlock = vaultDeployBlock(chainId, deployment);
  const deployBlockData = await publicClient.getBlock({ blockNumber: deployBlock });
  const period = resolveWeightingPeriod(chainId, deployment, Number(deployBlockData.timestamp));

  const logs = await scanVaultTransferLogs(
    publicClient,
    vault,
    period.fromBlock > latestBlock ? latestBlock : period.fromBlock,
    latestBlock,
    { rpcUrls }
  );

  const blockTimestamps = new Map<string, number>();
  for (const log of logs) {
    const key = log.blockNumber.toString();
    if (!blockTimestamps.has(key)) {
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      blockTimestamps.set(key, Number(block.timestamp));
    }
  }

  const latestBlockData = await publicClient.getBlock({ blockNumber: latestBlock });
  const periodEndTimestamp = Number(latestBlockData.timestamp);

  const transfers = transfersFromLogs(logs, blockTimestamps);
  const { holders: weightedHolders, totalWeight } = weightedHoldersFromTransfers({
    periodStartTimestamp: period.periodStartTimestamp,
    periodEndTimestamp,
    initialBalances: period.initialBalances,
    transfers,
  });

  if (totalWeight === 0n) return null;

  const userRow = weightedHolders.find((h) => h.address.toLowerCase() === userAddress.toLowerCase());
  if (!userRow) return null;

  const [pendingUsdc6, totalSupply, deadShares, userSharesNow, uncollectedGrossUsdc6] =
    await Promise.all([
      publicClient.readContract({
        address: vault,
        abi: abis.vault,
        functionName: "pendingUserRewards",
      }) as Promise<bigint>,
      publicClient.readContract({
        address: vault,
        abi: abis.vault,
        functionName: "totalSupply",
      }) as Promise<bigint>,
      publicClient.readContract({
        address: vault,
        abi: abis.vault,
        functionName: "balanceOf",
        args: [DEAD],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: vault,
        abi: abis.vault,
        functionName: "balanceOf",
        args: [userAddress],
      }) as Promise<bigint>,
      readUncollectedGrossUsdc6(publicClient, deployment),
    ]);

  const eligibleShareSupply = totalSupply > deadShares ? totalSupply - deadShares : totalSupply;
  const poolUsdc6 = distributionPoolUsdc6(pendingUsdc6, uncollectedGrossUsdc6);

  const referrer = await fetchReferrer(publicClient, deployment.referralRegistry, userAddress);
  const referrers: ReferrerLookup | undefined = referrer
    ? new Map([[userAddress.toLowerCase(), referrer]])
    : undefined;

  const estimatedUsdc6 = estimateUserPayoutUsdc6({
    weightedHolders,
    totalWeight,
    distributionPoolUsdc6: poolUsdc6,
    userAddress,
    referrers,
  });

  const syncedAtMs = Date.now();
  let poolAccrualUsdc6PerSecond = 0;
  if (
    params.previousUncollectedGrossUsdc6 !== undefined &&
    params.previousSyncedAtMs !== undefined &&
    syncedAtMs > params.previousSyncedAtMs
  ) {
    const deltaSec = (syncedAtMs - params.previousSyncedAtMs) / 1000;
    const grossDelta = uncollectedGrossUsdc6 - params.previousUncollectedGrossUsdc6;
    if (deltaSec > 0 && grossDelta > 0n) {
      const userDelta = (grossDelta * 6000n) / 10000n;
      poolAccrualUsdc6PerSecond = Number(userDelta) / deltaSec;
    }
  }

  const holderBalances = await Promise.all(
    weightedHolders.map(async (h) => {
      const bal = (await publicClient.readContract({
        address: vault,
        abi: abis.vault,
        functionName: "balanceOf",
        args: [h.address],
      })) as bigint;
      return { address: h.address, shareSeconds: h.shares.toString(), currentShares: bal.toString() };
    })
  );

  return {
    syncedAtMs,
    periodStartTimestamp: period.periodStartTimestamp,
    periodEndTimestamp,
    userShareSeconds: userRow.shares.toString(),
    totalShareSeconds: totalWeight.toString(),
    userShares: userSharesNow.toString(),
    eligibleShareSupply: eligibleShareSupply.toString(),
    pendingUsdc6: pendingUsdc6.toString(),
    uncollectedGrossUsdc6: uncollectedGrossUsdc6.toString(),
    distributionPoolUsdc6: poolUsdc6.toString(),
    poolAccrualUsdc6PerSecond: String(poolAccrualUsdc6PerSecond),
    estimatedUsdc6: estimatedUsdc6.toString(),
    userAddress: getAddress(userAddress),
    weightedHolders: holderBalances,
    referrer: referrer ?? null,
  };
}
