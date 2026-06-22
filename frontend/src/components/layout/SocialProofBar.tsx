"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useGuestDemo } from "@/lib/hooks/useGuestDemo";
import { projectXTvlBase, projectXVolumeBase } from "@/lib/demo/data";

function useLiveStat(base: number, variance: number, intervalMs = 3000) {
  const [value, setValue] = useState(base);
  useEffect(() => {
    const id = setInterval(() => {
      setValue((v) => v + (Math.random() - 0.45) * variance);
    }, intervalMs);
    return () => clearInterval(id);
  }, [base, variance, intervalMs]);
  return value;
}

function formatUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatCount(n: number) {
  return Math.floor(n).toLocaleString();
}

export function SocialProofBar() {
  const { t } = useI18n();
  const { isGuestDemo } = useGuestDemo();
  const tvlBase = projectXTvlBase();
  const volumeBase = projectXVolumeBase();
  const tvl = useLiveStat(tvlBase, tvlBase * 0.002);
  const volume = useLiveStat(volumeBase, volumeBase * 0.001);
  const users = useLiveStat(12_450, 8);

  const stats = [
    { label: t("socialProof.tvl"), value: formatUsd(tvl), color: "text-emerald-400" },
    { label: t("socialProof.volume"), value: formatUsd(volume), color: "text-cyan-400" },
    { label: t("socialProof.users"), value: formatCount(users), color: "text-violet-400" },
  ];

  if (!isGuestDemo) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto mb-4 px-1"
    >
      <p className="text-[10px] text-zinc-600 text-center mb-2">{t("socialProof.reference")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="px-2 py-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center"
          >
            <p className="text-[10px] text-zinc-500 truncate">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
