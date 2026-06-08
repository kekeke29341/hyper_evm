"use client";

import { motion } from "framer-motion";
import type { TabId } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";

export function TabHero({ activeTab }: { activeTab: TabId }) {
  const { t } = useI18n();

  return (
    <motion.div
      key={activeTab}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-md mx-auto mb-6 text-center px-2"
    >
      <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
        {t(`hero.${activeTab}.headline`)}
      </h1>
      <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
        {t(`hero.${activeTab}.subline`)}
      </p>
    </motion.div>
  );
}
