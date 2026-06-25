"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Copy, Check, LogOut, ExternalLink } from "lucide-react";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useWallet, type WalletId } from "@/lib/hooks/useWallet";
import { SUPPORTED_CHAINS, hasWalletConnect, defaultChain } from "@/lib/wagmi/config";
import { MetaMaskIcon, WalletConnectIcon, BrowserWalletIcon } from "@/components/wallet/WalletIcons";
import { WalletAlertNotice } from "@/components/layout/WalletAlertNotice";
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
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const { walletModalOpen, closeWalletModal, showToast } = useApp();
  const { t } = useI18n();
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!walletModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [walletModalOpen]);

  const walletOptions: WalletOption[] = [
    {
      id: "metaMask",
      name: t("walletModal.metaMask"),
      description: t("walletModal.metaMaskDesc"),
      icon: <MetaMaskIcon className="w-10 h-10" />,
      disabled: !findConnector("metaMask"),
      disabledReason: t("walletModal.metaMaskMissing"),
    },
    {
      id: "walletConnect",
      name: t("walletModal.walletConnect"),
      description: t("walletModal.walletConnectDesc"),
      icon: <WalletConnectIcon className="w-10 h-10" />,
      disabled: !hasWalletConnect || !findConnector("walletConnect"),
      disabledReason: hasWalletConnect
        ? t("walletModal.walletConnectUnavailable")
        : t("walletModal.walletConnectSetup"),
    },
    {
      id: "injected",
      name: t("walletModal.browserWallet"),
      description: t("walletModal.browserWalletDesc"),
      icon: <BrowserWalletIcon className="w-10 h-10" />,
    },
  ];

  const handleConnect = async (walletId: WalletId) => {
    setConnectingId(walletId);
    try {
      await connectWallet(walletId, selectedChain);
      showToast(t("walletModal.connectedToast"));
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
        showToast(t("walletModal.switchedToast"));
      } catch {
        showToast(t("walletModal.switchFailed"));
      }
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    showToast(t("common.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    disconnect();
    showToast(t("walletModal.disconnectedToast"));
    closeWalletModal();
  };

  const chainLabel = SUPPORTED_CHAINS.find((c) => c.id === chainId)?.label ?? `Chain ${chainId}`;

  return (
    mounted
      ? createPortal(
          <AnimatePresence>
            {walletModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  onClick={closeWalletModal}
                />
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  className="relative z-10 w-full sm:max-w-md card-glass rounded-t-2xl sm:rounded-2xl p-5 max-h-[min(90dvh,90vh)] overflow-y-auto safe-bottom"
                  role="dialog"
                  aria-modal="true"
                >
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="font-semibold text-white text-lg">
                  {isConnected ? t("walletModal.connectedTitle") : t("walletModal.connectTitle")}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isConnected ? `${walletName} · ${chainLabel}` : t("walletModal.connectSubtitle")}
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
                  <p className="text-xs text-zinc-500 mb-1">{t("walletModal.address")}</p>
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
                  <p className="text-xs text-zinc-500 mb-2">{t("walletModal.network")}</p>
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
                  {t("walletModal.disconnect")}
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-xs text-zinc-500 mb-2">{t("walletModal.selectNetwork")}</p>
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
                    <div key={option.id}>
                      {isHomePage && option.id === "metaMask" && (
                        <div className="mb-2">
                          <WalletAlertNotice compact />
                        </div>
                      )}
                      <WalletButton
                        option={option}
                        loading={isPending && connectingId === option.id}
                        onClick={() => handleConnect(option.id)}
                      />
                    </div>
                  ))}
                </div>

                {!hasWalletConnect && (
                  <p className="mt-3 text-[10px] text-zinc-600 flex items-start gap-1">
                    <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                    {t("walletModal.wcHint")}
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
              </div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null
  );
}
