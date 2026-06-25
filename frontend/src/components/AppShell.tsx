"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { savePendingReferralCode } from "@/lib/referral/codeStorage";
import { Header, Footer } from "@/components/layout/Header";
import { TabHero } from "@/components/layout/TabHero";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import { TestnetGuideBanner } from "@/components/layout/TestnetGuideBanner";
import { NetworkSwitchBanner } from "@/components/layout/NetworkSwitchBanner";
import { WalletModal } from "@/components/layout/WalletModal";
import { Toast } from "@/components/ui/shared";
import { DepositTab } from "@/components/tabs/DepositTab";
import { LiquidityTab } from "@/components/tabs/LiquidityTab";
import { DashboardTab } from "@/components/tabs/DashboardTab";
import { CashdropTab } from "@/components/tabs/CashdropTab";
import { AffiliateTab } from "@/components/tabs/AffiliateTab";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";
import { useI18n } from "@/lib/i18n";
import type { TabId } from "@/lib/constants";

const TAB_CONTENT: Record<TabId, React.ComponentType> = {
  dashboard: DashboardTab,
  deposit: DepositTab,
  liquidity: LiquidityTab,
  cashdrop: CashdropTab,
  affiliate: AffiliateTab,
};

export default function AppShell({ activeTab }: { activeTab: TabId }) {
  const { t } = useI18n();
  const Active = TAB_CONTENT[activeTab];
  const tabLabel = t(`tabs.${activeTab}`);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim();
    if (ref) savePendingReferralCode(ref);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header activeTab={activeTab} />
      <main className="flex-1 px-3 sm:px-4 py-6 sm:py-8 overflow-x-hidden">
        <NetworkSwitchBanner />
        <TestnetGuideBanner />
        <TabHero activeTab={activeTab} />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <TabErrorBoundary tabLabel={tabLabel}>
              <Active />
            </TabErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <WalletModal />
      <OnboardingModal />
      <Toast />
    </div>
  );
}
