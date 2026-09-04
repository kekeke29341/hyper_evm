"use client";

import { createContext, useContext, useMemo } from "react";
import type { PoolDeployment } from "@/lib/contracts";
import { getPoolByKey } from "@/lib/contracts";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";

type PoolContextValue = {
  pool: PoolDeployment;
  chainId: number;
};

const PoolContext = createContext<PoolContextValue | null>(null);

export function PoolProvider({ poolKey, children }: { poolKey: string; children: React.ReactNode }) {
  const chainId = useEffectiveChainId();
  const pool = useMemo(() => getPoolByKey(chainId, poolKey), [chainId, poolKey]);

  if (!pool) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-zinc-400">
        <p className="text-white font-semibold mb-2">Pool not found</p>
        <p className="text-sm">Key &quot;{poolKey}&quot; is not configured on chain {chainId}.</p>
      </div>
    );
  }

  return <PoolContext.Provider value={{ pool, chainId }}>{children}</PoolContext.Provider>;
}

export function usePoolContext(): PoolContextValue {
  const ctx = useContext(PoolContext);
  if (!ctx) throw new Error("usePoolContext must be used within PoolProvider");
  return ctx;
}
