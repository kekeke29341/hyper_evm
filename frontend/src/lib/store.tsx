"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useConnection } from "wagmi";
import { shortenAddress } from "@/lib/utils";

type AppContextType = {
  toast: string | null;
  showToast: (msg: string) => void;
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
  const [walletModalOpen, setWalletModalOpen] = useState(false);

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
