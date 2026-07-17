"use client";

import { useCallback } from "react";
import {
  useConnection,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useConnectors,
} from "wagmi";
import {
  appChains,
  defaultChain,
} from "@/lib/wagmi/config";

export type WalletId = "metaMask" | "walletConnect" | "injected";

const CONNECTOR_MAP: Record<WalletId, string[]> = {
  metaMask: ["metaMaskSDK", "io.metamask", "metaMask"],
  walletConnect: ["walletConnect"],
  injected: ["injected"],
};

async function addChainToWallet(targetChainId: number) {
  const c = appChains.find((chain) => chain.id === targetChainId);
  if (!c || typeof window === "undefined") return;
  const ethereum = (window as Window & { ethereum?: { request: (args: unknown) => Promise<unknown> } })
    .ethereum;
  if (!ethereum?.request) return;

  const rpcUrl = c.rpcUrls.default.http[0];
  if (!rpcUrl) return;

  await ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: `0x${c.id.toString(16)}`,
        chainName: c.name,
        nativeCurrency: c.nativeCurrency,
        rpcUrls: [rpcUrl],
        blockExplorerUrls: c.blockExplorers?.default?.url ? [c.blockExplorers.default.url] : [],
      },
    ],
  });
}

export function useWallet() {
  const { address, isConnected, chainId, connector } = useConnection();
  const connectors = useConnectors();
  const { connectAsync, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const findConnector = useCallback(
    (walletId: WalletId) => {
      const ids = CONNECTOR_MAP[walletId];
      return connectors.find((c) => ids.some((id) => c.id === id || c.name === id));
    },
    [connectors]
  );

  const connectWallet = useCallback(
    async (walletId: WalletId, targetChainId?: number) => {
      reset();
      const c = findConnector(walletId);
      if (!c) throw new Error(`Wallet connector not found: ${walletId}`);
      const chain = targetChainId ?? defaultChain.id;
      try {
        await connectAsync({ connector: c, chainId: chain });
      } catch {
        await addChainToWallet(chain);
        await connectAsync({ connector: c, chainId: chain });
      }
    },
    [connectAsync, findConnector, reset]
  );

  const switchNetwork = useCallback(
    async (targetChainId: number) => {
      try {
        await switchChainAsync({ chainId: targetChainId });
      } catch {
        await addChainToWallet(targetChainId);
        await switchChainAsync({ chainId: targetChainId });
      }
    },
    [switchChainAsync]
  );

  const walletName = connector?.name ?? "Wallet";

  return {
    address,
    isConnected,
    chainId,
    connector,
    walletName,
    connectWallet,
    disconnect,
    switchNetwork,
    isPending,
    isSwitching,
    error,
    findConnector,
  };
}
