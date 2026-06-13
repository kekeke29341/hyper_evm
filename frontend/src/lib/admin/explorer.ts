import { hyperEvmMainnet, hyperEvmTestnet, anvilLocal } from "@/lib/wagmi/config";

export function explorerBaseUrl(chainId: number): string | null {
  if (chainId === hyperEvmTestnet.id) return "https://testnet.purrsec.com";
  if (chainId === hyperEvmMainnet.id) return "https://purrsec.com";
  if (chainId === anvilLocal.id) return null;
  return null;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const base = explorerBaseUrl(chainId);
  if (!base) return null;
  return `${base}/address/${address}`;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const base = explorerBaseUrl(chainId);
  if (!base) return null;
  return `${base}/tx/${hash}`;
}
