"use client";

import { usePathname } from "next/navigation";
import { AppProvider } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { Web3Provider } from "@/lib/wagmi/provider";
import { WalletGate } from "@/components/layout/WalletGate";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = pathname === "/about" || pathname?.startsWith("/about/");

  if (isPublicPage) {
    return <>{children}</>;
  }

  return (
    <Web3Provider>
      <I18nProvider>
        <AppProvider>
          <WalletGate>{children}</WalletGate>
        </AppProvider>
      </I18nProvider>
    </Web3Provider>
  );
}
