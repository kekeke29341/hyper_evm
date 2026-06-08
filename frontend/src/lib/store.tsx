"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useConnection } from "wagmi";
import { shortenAddress } from "@/lib/utils";

type AppContextType = {
  toast: string | null;
  showToast: (msg: string) => void;
  livePoints: number;
  isConnected: boolean;
  displayAddress: string | null;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  walletModalOpen: boolean;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useConnection();
  const [toast, setToast] = useState<string | null>(null);
  const [livePoints, setLivePoints] = useState(14250);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setLivePoints((p) => p + Math.floor(Math.random() * 3)), 2000);
    return () => clearInterval(id);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const openWalletModal = useCallback(() => setWalletModalOpen(true), []);
  const closeWalletModal = useCallback(() => setWalletModalOpen(false), []);

  return (
    <AppContext.Provider
      value={{
        toast,
        showToast,
        livePoints,
        isConnected,
        displayAddress: address ? shortenAddress(address) : null,
        openWalletModal,
        closeWalletModal,
        walletModalOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
