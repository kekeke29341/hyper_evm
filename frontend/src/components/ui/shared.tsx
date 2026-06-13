"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Toast() {
  const { toast } = useApp();
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white shadow-xl safe-bottom mb-[env(safe-area-inset-bottom)]"
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MainCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("w-full max-w-md mx-auto card-glass rounded-2xl p-4 sm:p-5", className)}
    >
      {children}
    </motion.div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full py-3.5 rounded-xl font-semibold text-sm transition-all",
        disabled ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "gradient-btn"
      )}
    >
      {children}
    </button>
  );
}

export function InfoBanner({ text }: { text: string }) {
  return (
    <div className="flex gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed">
      <span className="shrink-0 text-amber-400" aria-hidden>
        ℹ
      </span>
      <p>{text}</p>
    </div>
  );
}

export function StatPill({
  label,
  value,
  accent = "emerald",
}: {
  label: string;
  value: string;
  accent?: "emerald" | "cyan" | "violet";
}) {
  const colors = {
    emerald: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    cyan: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
    violet: "text-violet-400 border-violet-500/30 bg-violet-500/10",
  };
  return (
    <div className={`px-3 py-2 rounded-xl border text-center ${colors[accent]}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-sm font-bold mt-0.5">{value}</p>
    </div>
  );
}
