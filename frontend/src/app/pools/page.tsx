import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HYPE Pools | Hyperpool",
  description: "HYPE-quoted managed LP vaults — UETH, UBTC, UPUMP on HyperEVM",
};

export { PoolPicker as default } from "@/components/pools/PoolPicker";
