import { fallback, http, type Transport } from "viem";
import { arbitrum, base, mainnet, polygon } from "viem/chains";

const HYPER_EVM_TESTNET = 998;
const HYPER_EVM_MAINNET = 999;

/** Public RPC endpoints with fallbacks — avoids flaky defaults (e.g. mainnet.base.org on mobile). */
const RPC_URLS: Record<number, readonly string[]> = {
  [mainnet.id]: [
    "https://ethereum-rpc.publicnode.com",
    "https://cloudflare-eth.com",
  ],
  [arbitrum.id]: [
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arb1.arbitrum.io/rpc",
  ],
  [base.id]: [
    "https://base-rpc.publicnode.com",
    "https://1rpc.io/base",
    "https://mainnet.base.org",
  ],
  [polygon.id]: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon-rpc.com",
  ],
  [HYPER_EVM_TESTNET]: [
    process.env.NEXT_PUBLIC_TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet",
  ],
  [HYPER_EVM_MAINNET]: [
    process.env.NEXT_PUBLIC_MAINNET_RPC ?? "https://rpc.hyperliquid.xyz/evm",
  ],
};

export function httpTransportForChain(chainId: number): Transport {
  const urls = RPC_URLS[chainId];
  if (!urls?.length) return http();
  if (urls.length === 1) {
    return http(urls[0], { timeout: 15_000, retryCount: 2 });
  }
  return fallback(
    urls.map((url) => http(url, { timeout: 15_000, retryCount: 1 })),
    { rank: false }
  );
}
