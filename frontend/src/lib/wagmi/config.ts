"use client";

import { http, createConfig, type Transport } from "wagmi";
import { defineChain } from "viem";
import { arbitrum, base, mainnet, polygon } from "viem/chains";
import { metaMask, walletConnect, injected } from "wagmi/connectors";
import { httpTransportForChain } from "@/lib/wagmi/rpc";

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
    default: { name: "HyperEVMScan", url: "https://hyperevmscan.io" },
  },
});

const defaultChainId = Number(
  process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ??
    (process.env.NODE_ENV === "development" ? "31337" : "999")
);

export const defaultChain =
  defaultChainId === hyperEvmMainnet.id
    ? hyperEvmMainnet
    : defaultChainId === hyperEvmTestnet.id
      ? hyperEvmTestnet
      : defaultChainId === anvilLocal.id
        ? anvilLocal
        : hyperEvmTestnet;

/** Include Anvil only for explicit local dev (default chain 31337 in development). */
export const includeAnvilChain =
  process.env.NODE_ENV === "development" && defaultChainId === anvilLocal.id;

/** Li.FI bridge source chains (Ethereum / L2s). Included in wagmi for approve + bridge txs. */
export const bridgeSourceChains = [mainnet, arbitrum, base, polygon] as const;

export const hyperpoolChains = (
  includeAnvilChain
    ? [anvilLocal, hyperEvmTestnet, hyperEvmMainnet]
    : [hyperEvmTestnet, hyperEvmMainnet]
) as
  | [typeof hyperEvmTestnet, typeof hyperEvmMainnet]
  | [typeof anvilLocal, typeof hyperEvmTestnet, typeof hyperEvmMainnet];

export const appChains = [...bridgeSourceChains, ...hyperpoolChains] as const;

const dappUrl = typeof window !== "undefined" ? window.location.origin : "https://www.prjx.com";
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const connectors = [
  metaMask({
    dappMetadata: { name: "Hyperpool", url: dappUrl },
  }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "Hyperpool",
            description: "HyperEVM managed LP — Vault deposits & USDC Cashdrop",
            url: dappUrl,
            icons: [`${dappUrl}/favicon.ico`],
          },
        }),
      ]
    : []),
  injected({ shimDisconnect: true }),
];

const transports: Record<number, Transport> = {
  [mainnet.id]: httpTransportForChain(mainnet.id),
  [arbitrum.id]: httpTransportForChain(arbitrum.id),
  [base.id]: httpTransportForChain(base.id),
  [polygon.id]: httpTransportForChain(polygon.id),
  [hyperEvmTestnet.id]: httpTransportForChain(hyperEvmTestnet.id),
  [hyperEvmMainnet.id]: httpTransportForChain(hyperEvmMainnet.id),
};
if (includeAnvilChain) {
  transports[anvilLocal.id] = http();
}

export const wagmiConfig = createConfig({
  chains: appChains,
  connectors,
  ssr: true,
  transports,
});

export const SUPPORTED_CHAINS = includeAnvilChain
  ? [
      { id: anvilLocal.id, label: "Anvil Local", shortLabel: "Local", description: "Local dev (31337)" },
      {
        id: hyperEvmTestnet.id,
        label: "HyperEVM Testnet",
        shortLabel: "Testnet",
        description: "Chain 998",
      },
      { id: hyperEvmMainnet.id, label: "HyperEVM", shortLabel: "Mainnet", description: "Chain 999 (mainnet)" },
    ]
  : [
      {
        id: hyperEvmTestnet.id,
        label: "HyperEVM Testnet",
        shortLabel: "Testnet",
        description: "Chain 998",
      },
      { id: hyperEvmMainnet.id, label: "HyperEVM", shortLabel: "Mainnet", description: "Chain 999 (mainnet)" },
    ];

export const hasWalletConnect = Boolean(walletConnectProjectId);
