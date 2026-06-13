export type TabId = "swap" | "liquidity" | "portfolio" | "cashdrop" | "points" | "affiliate";

export const TAB_IDS: TabId[] = ["swap", "liquidity", "portfolio", "cashdrop", "points", "affiliate"];

export { BRIDGE_CHAINS, CHAINS } from "@/lib/lifi/config";

export const TOKENS = [
  { symbol: "kHYPE", name: "kHYPE", color: "bg-emerald-500" },
  { symbol: "HYPE", name: "HYPE", color: "bg-cyan-500" },
  { symbol: "USDC", name: "USDC", color: "bg-blue-500" },
  { symbol: "HPOOL", name: "HPOOL", color: "bg-violet-500" },
  { symbol: "ETH", name: "ETH", color: "bg-indigo-500" },
];

export const POOLS = [
  {
    id: "khype-usdc-03",
    pair: "kHYPE/USDC",
    feeTier: "0.3%",
    apr: "124.5%",
    aprNum: 124.5,
    tvl: "$12.4M",
    volume24h: "$8.2M",
    featured: true,
    live: true,
  },
  {
    id: "hype-usdc-03",
    pair: "HYPE/USDC",
    feeTier: "0.3%",
    apr: "98.2%",
    aprNum: 98.2,
    tvl: "$8.1M",
    volume24h: "$5.1M",
    featured: true,
    live: false,
  },
  {
    id: "hpool-usdc-03",
    pair: "HPOOL/USDC",
    feeTier: "0.3%",
    apr: "156.0%",
    aprNum: 156,
    tvl: "$3.2M",
    volume24h: "$2.4M",
    featured: false,
    live: false,
  },
  {
    id: "eth-usdc-05",
    pair: "ETH/USDC",
    feeTier: "0.05%",
    apr: "42.8%",
    aprNum: 42.8,
    tvl: "$1.9M",
    volume24h: "$1.1M",
    featured: false,
    live: false,
  },
];

export const LEADERBOARD = [
  { rank: 1, address: "0x1a2b...3c4d", points: "892,400", multiplier: "×3.0" },
  { rank: 2, address: "0x5e6f...7a8b", points: "756,200", multiplier: "×3.0" },
  { rank: 3, address: "0x9c0d...1e2f", points: "621,800", multiplier: "×2.0" },
  { rank: 4, address: "0x3a4b...5c6d", points: "498,300", multiplier: "×2.0" },
  { rank: 5, address: "0x7e8f...9a0b", points: "412,100", multiplier: "×1.5" },
];

export const AFFILIATE_LEADERBOARD = [
  { rank: 1, address: "0x1a...3b", reward: "1,240 USDC" },
  { rank: 2, address: "0x4c...5d", reward: "980 USDC" },
  { rank: 3, address: "0x6e...7f", reward: "720 USDC" },
  { rank: 4, address: "0x8a...9b", reward: "540 USDC" },
  { rank: 5, address: "0x2c...3d", reward: "410 USDC" },
];

export const CHART_DATA = [
  { day: "Mon", pts: 1200 },
  { day: "Tue", pts: 1800 },
  { day: "Wed", pts: 1400 },
  { day: "Thu", pts: 2200 },
  { day: "Fri", pts: 1900 },
  { day: "Sat", pts: 2600 },
  { day: "Sun", pts: 2400 },
];

export const WALLETS = [
  { name: "MetaMask", chains: ["HyperEVM", "Ethereum"] },
  { name: "Phantom", chains: ["Solana", "HyperEVM"] },
  { name: "WalletConnect", chains: ["Multi-chain"] },
  { name: "Coinbase Wallet", chains: ["Ethereum", "Base"] },
];
