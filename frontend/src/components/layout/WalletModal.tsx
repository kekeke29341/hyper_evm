"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Copy, Check, LogOut, ExternalLink } from "lucide-react";
import { useApp } from "@/lib/store";
import { useWallet, type WalletId } from "@/lib/hooks/useWallet";
import { SUPPORTED_CHAINS, hasWalletConnect, defaultChain } from "@/lib/wagmi/config";
import { MetaMaskIcon, WalletConnectIcon, BrowserWalletIcon } from "@/components/wallet/WalletIcons";
import { cn } from "@/lib/utils";

type WalletOption = {
  id: WalletId;
  name: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
};

function WalletButton({
  option,
  loading,
  onClick,
}: {
  option: WalletOption;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={option.disabled || loading}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
        option.disabled
          ? "border-zinc-800 bg-zinc-900/30 opacity-50 cursor-not-allowed"
          : "border-zinc-700 bg-zinc-800/50 hover:border-cyan-500/50 hover:bg-zinc-800/80",
        loading && "opacity-70"
      )}
    >
      <div className="w-10 h-10 shrink-0">{option.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white text-sm">{option.name}</p>
        <p className="text-xs text-zinc-500 truncate">
          {option.disabled ? option.disabledReason : option.description}
        </p>
      </div>
      {loading && <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />}
    </button>
  );
}

export function WalletModal() {
  const { walletModalOpen, closeWalletModal, showToast } = useApp();
  const {
    isConnected,
    address,
    chainId,
    walletName,
    connectWallet,
    disconnect,
    switchNetwork,
    isPending,
    isSwitching,
    error,
    findConnector,
  } = useWallet();

  const [selectedChain, setSelectedChain] = useState<number>(defaultChain.id);
  const [connectingId, setConnectingId] = useState<WalletId | null>(null);
  const [copied, setCopied] = useState(false);

  const walletOptions: WalletOption[] = [
    {
      id: "metaMask",
      name: "MetaMask",
      description: "Connect via browser extension or mobile app",
      icon: <MetaMaskIcon className="w-10 h-10" />,
      disabled: !findConnector("metaMask"),
      disabledReason: "MetaMask not detected — install extension",
    },
    {
      id: "walletConnect",
      name: "WalletConnect",
      description: "Scan QR with mobile wallet",
      icon: <WalletConnectIcon className="w-10 h-10" />,
      disabled: !hasWalletConnect || !findConnector("walletConnect"),
      disabledReason: hasWalletConnect
        ? "WalletConnect unavailable"
        : "Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
    },
    {
      id: "injected",
      name: "Browser Wallet",
      description: "Use any injected EVM wallet",
      icon: <BrowserWalletIcon className="w-10 h-10" />,
    },
  ];

  const handleConnect = async (walletId: WalletId) => {
    setConnectingId(walletId);
    try {
      await connectWallet(walletId, selectedChain);
      showToast(`Connected via ${walletOptions.find((w) => w.id === walletId)?.name}`);
      closeWalletModal();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      if (!msg.toLowerCase().includes("user rejected")) {
        showToast(msg.slice(0, 80));
      }
    } finally {
      setConnectingId(null);
    }
  };

  const handleSwitch = async (id: number) => {
    setSelectedChain(id);
    if (isConnected) {
      try {
        await switchNetwork(id);
        showToast(`Switched to chain ${id}`);
      } catch {
        showToast("Network switch failed — approve in wallet");
      }
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    showToast("Address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    disconnect();
    showToast("Disconnected");
    closeWalletModal();
  };

  const chainLabel = SUPPORTED_CHAINS.find((c) => c.id === chainId)?.label ?? `Chain ${chainId}`;

  return (
    <AnimatePresence>
      {walletModalOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={closeWalletModal}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md card-glass rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="font-semibold text-white text-lg">
                  {isConnected ? "Wallet Connected" : "Connect Wallet"}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isConnected ? `${walletName} · ${chainLabel}` : "Choose a wallet to continue"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeWalletModal}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isConnected && address ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-800/60 border border-zinc-700">
                  <p className="text-xs text-zinc-500 mb-1">Address</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-cyan-400 font-mono flex-1 truncate">{address}</code>
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-zinc-500 mb-2">Network</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_CHAINS.map((chain) => (
                      <button
                        key={chain.id}
                        type="button"
                        onClick={() => handleSwitch(chain.id)}
                        disabled={isSwitching}
                        className={cn(
                          "p-3 rounded-xl border text-left text-sm transition-colors",
                          chainId === chain.id
                            ? "border-cyan-500/50 bg-cyan-500/10 text-white"
                            : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600"
                        )}
                      >
                        <p className="font-medium">{chain.label}</p>
                        <p className="text-[10px] opacity-70">{chain.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-xs text-zinc-500 mb-2">Select network</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_CHAINS.map((chain) => (
                      <button
                        key={chain.id}
                        type="button"
                        onClick={() => setSelectedChain(chain.id)}
                        className={cn(
                          "p-2.5 rounded-xl border text-left text-xs transition-colors",
                          selectedChain === chain.id
                            ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        )}
                      >
                        <p className="font-medium">{chain.label}</p>
                        <p className="text-[10px] opacity-70">{chain.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {walletOptions.map((option) => (
                    <WalletButton
                      key={option.id}
                      option={option}
                      loading={isPending && connectingId === option.id}
                      onClick={() => handleConnect(option.id)}
                    />
                  ))}
                </div>

                {!hasWalletConnect && (
                  <p className="mt-3 text-[10px] text-zinc-600 flex items-start gap-1">
                    <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                    WalletConnect: get a free Project ID at cloud.reown.com and set
                    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
                  </p>
                )}

                {error && (
                  <p className="mt-3 text-xs text-red-400/90 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    {error.message.slice(0, 120)}
                  </p>
                )}
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
