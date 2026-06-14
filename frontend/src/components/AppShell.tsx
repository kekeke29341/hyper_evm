"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Header, Footer } from "@/components/layout/Header";
import { TabHero } from "@/components/layout/TabHero";
import { SocialProofBar } from "@/components/layout/SocialProofBar";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import { TestnetGuideBanner } from "@/components/layout/TestnetGuideBanner";
import { NetworkSwitchBanner } from "@/components/layout/NetworkSwitchBanner";
import { WalletModal } from "@/components/layout/WalletModal";
import { Toast } from "@/components/ui/shared";
import { SwapTab } from "@/components/tabs/SwapTab";
import { LiquidityTab } from "@/components/tabs/LiquidityTab";
import { PortfolioTab } from "@/components/tabs/PortfolioTab";
import { CashdropTab } from "@/components/tabs/CashdropTab";
import { PointsTab } from "@/components/tabs/PointsTab";
import { AffiliateTab } from "@/components/tabs/AffiliateTab";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";
import { useI18n } from "@/lib/i18n";
import type { TabId } from "@/lib/constants";

const TAB_CONTENT: Record<TabId, React.ComponentType> = {
  swap: SwapTab,
  liquidity: LiquidityTab,
  portfolio: PortfolioTab,
  cashdrop: () => null,
  points: PointsTab,
  affiliate: AffiliateTab,
};

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("swap");
  const { t } = useI18n();
  const Active = TAB_CONTENT[activeTab];
  const tabLabel = t(`tabs.${activeTab}`);

  return (
    <div className="min-h-screen flex flex-col">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 px-3 sm:px-4 py-6 sm:py-8">
        <SocialProofBar />
        <NetworkSwitchBanner />
        <TestnetGuideBanner />
        <TabHero activeTab={activeTab} />
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "cashdrop" ? (
              <TabErrorBoundary tabLabel={tabLabel}>
                <CashdropTab
                  onGoToPoints={() => setActiveTab("points")}
                  onGoToAffiliate={() => setActiveTab("affiliate")}
                />
              </TabErrorBoundary>
            ) : (
              <TabErrorBoundary tabLabel={tabLabel}>
                <Active />
              </TabErrorBoundary>
            )}
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
