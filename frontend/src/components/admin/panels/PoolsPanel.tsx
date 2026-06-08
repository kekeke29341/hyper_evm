"use client";

import { useState } from "react";
import { type Address, isAddress } from "viem";
import { useReadContract } from "wagmi";
import { useAdminActions, useAdminAuth } from "@/lib/hooks/useAdmin";
import { abis } from "@/lib/contracts";
import { AdminCard, AdminButton, AdminInput, AddressChip } from "../AdminUi";
import { useApp } from "@/lib/store";

export function PoolsPanel() {
  const { deployment, isFactoryAdmin, isPointsOwner } = useAdminAuth();
  const { createPair, authorizePool, deauthorizePool, syncPairs, isPending } = useAdminActions();
  const { showToast } = useApp();

  const [tokenA, setTokenA] = useState("");
  const [tokenB, setTokenB] = useState("");
  const [authPool, setAuthPool] = useState("");

  const { data: isAuthorized } = useReadContract({
    address: deployment?.pointsDistributor,
    abi: abis.points,
    functionName: "authorizedPools",
    args: deployment?.pair ? [deployment.pair] : undefined,
    query: { enabled: !!deployment?.pair },
  });

  const { data: feeCollector } = useReadContract({
    address: deployment?.factory,
    abi: abis.factory,
    functionName: "feeCollector",
    query: { enabled: !!deployment },
  });

  const { data: pairsLen } = useReadContract({
    address: deployment?.factory,
    abi: abis.factory,
    functionName: "allPairsLength",
    query: { enabled: !!deployment },
  });

  if (!deployment) return null;

  const pairCount = pairsLen !== undefined ? Number(pairsLen) : 0;

  const defaultA = deployment.tokenKHYPE;
  const defaultB = deployment.tokenUSDC;

  const resolveAddress = (input: string, fallback: Address): Address => {
    const value = input.trim() || fallback;
    if (!isAddress(value)) throw new Error(`Invalid address: ${value}`);
    return value;
  };

  const handleCreate = async () => {
    try {
      const a = resolveAddress(tokenA, defaultA);
      const b = resolveAddress(tokenB, defaultB);
      await createPair(a, b);
      showToast("Pair creation submitted");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Create pair failed");
    }
  };

  const handleAuthorize = async (pool: Address) => {
    try {
      if (!isAddress(pool)) throw new Error("Invalid pool address");
      await authorizePool(pool);
      showToast("Pool authorized for points");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Authorize failed");
    }
  };

  const handleDeauthorize = async (pool: Address) => {
    try {
      if (!isAddress(pool)) throw new Error("Invalid pool address");
      await deauthorizePool(pool);
      showToast("Pool deauthorized");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Deauthorize failed");
    }
  };

  const handleSyncPairs = async () => {
    try {
      if (pairCount === 0) throw new Error("No pairs to sync");
      await syncPairs(0, pairCount);
      showToast("Pair config synced from factory");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Sync failed");
    }
  };

  return (
    <div className="space-y-4">
      <AdminCard title="Pool Management" subtitle="Create pairs via Factory; authorize for PointsDistributor">
        <div className="space-y-3">
          <AdminInput
            label="Token A (default kHYPE)"
            value={tokenA}
            onChange={setTokenA}
            placeholder={defaultA}
          />
          <AdminInput
            label="Token B (default USDC)"
            value={tokenB}
            onChange={setTokenB}
            placeholder={defaultB}
          />
          <AdminButton onClick={handleCreate} disabled={isPending || !isFactoryAdmin}>
            {isFactoryAdmin ? "Create Pair" : "Factory admin wallet required"}
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard title="Primary Pair">
        <div className="space-y-3">
          <AddressChip label="Pair" address={deployment.pair} />
          <AddressChip label="Fee Collector" address={(feeCollector as string) ?? "—"} />
          <p className="text-xs text-zinc-500">
            Points authorized:{" "}
            <span className={isAuthorized ? "text-emerald-400" : "text-amber-400"}>
              {isAuthorized ? "Yes" : "No — authorize below"}
            </span>
          </p>
          {!isAuthorized && (
            <AdminButton
              variant="secondary"
              onClick={() => handleAuthorize(deployment.pair)}
              disabled={isPending || !isPointsOwner}
            >
              {isPointsOwner ? "Authorize Primary Pair" : "Points owner required"}
            </AdminButton>
          )}
        </div>
      </AdminCard>

      <AdminCard title="Authorize Custom Pool" subtitle="PointsDistributor owner only">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <AdminInput
              label="Pool address"
              value={authPool}
              onChange={setAuthPool}
              placeholder={deployment.pair}
            />
          </div>
          <AdminButton
            onClick={() => handleAuthorize(resolveAddress(authPool, deployment.pair))}
            disabled={isPending || !isPointsOwner}
          >
            Authorize
          </AdminButton>
          <AdminButton
            variant="danger"
            onClick={() => handleDeauthorize(resolveAddress(authPool, deployment.pair))}
            disabled={isPending || !isPointsOwner}
          >
            Deauthorize
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard title="Sync Factory Config" subtitle="Push fee collector / points distributor to all pairs">
        <p className="text-xs text-zinc-500 mb-3">
          Pairs: {pairCount}. Run after updating factory settings.
        </p>
        <AdminButton onClick={handleSyncPairs} disabled={isPending || !isFactoryAdmin || pairCount === 0}>
          {isFactoryAdmin ? "Sync All Pairs" : "Factory admin required"}
        </AdminButton>
      </AdminCard>
    </div>
  );
}
