"use client";

import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { metaMask, walletConnect, injected } from "wagmi/connectors";

export const anvilLocal = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"] },
  },
});

export const hyperEvmTestnet = defineChain({
  id: 998,
  name: "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_TESTNET_RPC ?? "https://rpcs.chain.link/hyperevm/testnet",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Purrsec Testnet", url: "https://testnet.purrsec.com" },
  },
});

export const hyperEvmMainnet = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_MAINNET_RPC ?? "https://rpc.hyperliquid.xyz/evm"],
    },
  },
  blockExplorers: {
    default: { name: "Purrsec", url: "https://purrsec.com" },
  },
});

const defaultChainId = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? "31337");

export const defaultChain =
  defaultChainId === hyperEvmMainnet.id
    ? hyperEvmMainnet
    : defaultChainId === hyperEvmTestnet.id
      ? hyperEvmTestnet
      : anvilLocal;

const dappUrl = typeof window !== "undefined" ? window.location.origin : "https://www.prjx.com";
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const connectors = [
  metaMask({
    dappMetadata: { name: "Project X", url: dappUrl },
  }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "Project X",
            description: "HyperEVM DEX — Swap, Liquidity & Points",
            url: dappUrl,
            icons: [`${dappUrl}/favicon.ico`],
          },
        }),
      ]
    : []),
  injected({ shimDisconnect: true }),
];

export const wagmiConfig = createConfig({
  chains: [anvilLocal, hyperEvmTestnet, hyperEvmMainnet],
  connectors,
  transports: {
    [anvilLocal.id]: http(),
    [hyperEvmTestnet.id]: http(),
    [hyperEvmMainnet.id]: http(),
  },
});

export const SUPPORTED_CHAINS = [
  { id: anvilLocal.id, label: "Anvil Local", description: "Local dev (31337)" },
  { id: hyperEvmTestnet.id, label: "HyperEVM Testnet", description: "Chain 998" },
  { id: hyperEvmMainnet.id, label: "HyperEVM", description: "Chain 999 (mainnet)" },
] as const;

export const hasWalletConnect = Boolean(walletConnectProjectId);
