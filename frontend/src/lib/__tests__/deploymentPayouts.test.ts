import { describe, it, expect } from "vitest";
import {
  deploymentPayoutClaims,
  formatUsdcDisplay,
} from "@/lib/earnings/deploymentPayouts";
import type { Deployment } from "@/lib/contracts";

describe("deploymentPayoutClaims", () => {
  const deployment = {
    chainId: 999,
    airdrop: "0x67d45f8535ec3f268f1acb0fe69ec87ad7aa7431",
    tokenKHYPE: "0x5555555555555555555555555555555555555555",
    tokenUSDC: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    airdropEntries: [
      {
        address: "0xF35208BfAdc5f7d38334FD71f42FdDC7eeB85b55",
        amount: "7088",
        minShares: "1",
      },
    ],
    lastCashdropDistribution: {
      distributionId: "0x595cb5156d3336148d2a782527f401565bb8581306396fd22c09e0e72a96b913",
      txHash: "0xa5763a151600373fd51a8cade572c1095e6718ef24f023a47a0b63cf7f4c796f",
      amount: "1743427",
      entries: 4,
      executedAt: "2026-07-07T01:17:02.996Z",
    },
  } as Deployment;

  it("returns claim for matching holder", () => {
    const claims = deploymentPayoutClaims(
      deployment,
      "0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55"
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].usdc).toBeCloseTo(0.007088, 6);
    expect(claims[0].txHash).toBe(deployment.lastCashdropDistribution?.txHash);
  });

  it("returns empty when airdropEntries missing", () => {
    expect(
      deploymentPayoutClaims({ ...deployment, airdropEntries: [] }, "0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55")
    ).toEqual([]);
  });

  it("accumulates every day from cashdropDistributionHistory", () => {
    const withHistory = {
      ...deployment,
      cashdropDistributionHistory: [
        {
          distributionId: "0x01",
          txHash: "0xaaa1",
          executedAt: "2026-07-24T00:30:00.000Z",
          entries: [
            { address: "0xF35208BfAdc5f7d38334FD71f42FdDC7eeB85b55", amount: "30000" },
          ],
        },
        {
          distributionId: "0x02",
          txHash: "0xaaa2",
          executedAt: "2026-07-25T00:28:00.000Z",
          entries: [
            { address: "0xF35208BfAdc5f7d38334FD71f42FdDC7eeB85b55", amount: "70000" },
            { address: "0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC", amount: "25000" },
          ],
        },
      ],
    } as Deployment;

    const claims = deploymentPayoutClaims(
      withHistory,
      "0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55"
    );
    expect(claims).toHaveLength(3);
    expect(claims.map((c) => c.txHash)).toEqual([
      "0xa5763a151600373fd51a8cade572c1095e6718ef24f023a47a0b63cf7f4c796f",
      "0xaaa1",
      "0xaaa2",
    ]);
    expect(claims[1].usdc).toBeCloseTo(0.03, 6);
    expect(claims[2].usdc).toBeCloseTo(0.07, 6);
  });

  it("does not duplicate lastCashdropDistribution already present in history", () => {
    const withHistory = {
      ...deployment,
      cashdropDistributionHistory: [
        {
          distributionId: deployment.lastCashdropDistribution!.distributionId,
          txHash: deployment.lastCashdropDistribution!.txHash,
          executedAt: deployment.lastCashdropDistribution!.executedAt,
          entries: [
            { address: "0xF35208BfAdc5f7d38334FD71f42FdDC7eeB85b55", amount: "7088" },
          ],
        },
      ],
    } as Deployment;

    const claims = deploymentPayoutClaims(
      withHistory,
      "0xf35208bfadc5f7d38334fd71f42fddc7eeb85b55"
    );
    expect(claims).toHaveLength(1);
  });
});

describe("formatUsdcDisplay", () => {
  it("shows micro amounts with 6 decimals", () => {
    expect(formatUsdcDisplay(0.007088)).toBe("0.007088");
  });

  it("shows zero for non-positive", () => {
    expect(formatUsdcDisplay(0)).toBe("0.00");
  });
});
