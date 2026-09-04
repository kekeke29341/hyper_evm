import type { Metadata } from "next";
import { PoolProvider } from "@/lib/pools/PoolContext";
import { PoolPositionView } from "@/components/pools/PoolPositionView";

const LABELS: Record<string, string> = {
  "ueth-whype": "UETH/HYPE",
  "ubtc-whype": "UBTC/HYPE",
  "upump-whype": "UPUMP/HYPE",
};

export function generateMetadata({ params }: { params: { poolKey: string } }): Metadata {
  const label = LABELS[params.poolKey] ?? params.poolKey;
  return {
    title: `${label} Vault | Hyperpool`,
    description: `Managed LP vault for ${label} on HyperEVM`,
  };
}

export default function PoolDetailPage({ params }: { params: { poolKey: string } }) {
  return (
    <PoolProvider poolKey={params.poolKey}>
      <PoolPositionView />
    </PoolProvider>
  );
}
