import type { Metadata } from "next";
import type { TabId } from "@/lib/constants";

/** Public URL for each main tab (Position uses /position, not /liquidity). */
export const TAB_PATH: Record<TabId, string> = {
  dashboard: "/",
  deposit: "/deposit",
  liquidity: "/position",
  cashdrop: "/cashdrop",
  affiliate: "/affiliate",
};

const PATH_TO_TAB: Record<string, TabId> = {
  "/": "dashboard",
  "/deposit": "deposit",
  "/position": "liquidity",
  "/cashdrop": "cashdrop",
  "/affiliate": "affiliate",
};

export function tabPath(tab: TabId): string {
  return TAB_PATH[tab];
}

export function tabFromPath(path: string): TabId | null {
  const normalized = path.split("?")[0]?.split("#")[0] ?? "/";
  return PATH_TO_TAB[normalized] ?? null;
}

const TAB_PAGE_METADATA: Record<TabId, Pick<Metadata, "title" | "description">> = {
  dashboard: {
    title: "Dashboard | Hyperpool",
    description: "View your Hyperpool position, earnings, and daily USDC rewards on HyperEVM.",
  },
  deposit: {
    title: "Bridge | Hyperpool",
    description: "Bridge USDC and other assets to HyperEVM via Li.FI and deposit into Hyperpool Vault.",
  },
  liquidity: {
    title: "Position | Hyperpool",
    description: "Manage your Project X managed LP position, add liquidity, and track vault shares.",
  },
  cashdrop: {
    title: "Cashdrop | Hyperpool",
    description: "Claim your daily USDC share of collected trading fees (JST 7:00–9:00).",
  },
  affiliate: {
    title: "Affiliate | Hyperpool",
    description: "Refer users and earn rewards through the Hyperpool affiliate program.",
  },
};

export function tabPageMetadata(tab: TabId): Metadata {
  return TAB_PAGE_METADATA[tab];
}
