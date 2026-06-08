"use client";

import { AppProvider } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { Web3Provider } from "@/lib/wagmi/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <I18nProvider>
        <AppProvider>{children}</AppProvider>
      </I18nProvider>
    </Web3Provider>
  );
}
