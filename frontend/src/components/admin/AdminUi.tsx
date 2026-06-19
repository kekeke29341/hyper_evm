"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { explorerAddressUrl } from "@/lib/admin/explorer";
import { cn } from "@/lib/utils";

export function AdminCard({
  children,
  className,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn("card-glass rounded-2xl p-5 border border-zinc-800/80", className)}>
      {title && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-1">{sub}</p>}
    </div>
  );
}

export function AdminButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "gradient-btn",
        variant === "secondary" && "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-600",
        variant === "danger" && "bg-red-900/40 border border-red-800 text-red-300 hover:bg-red-900/60"
      )}
    >
      {children}
    </button>
  );
}

export function AdminInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-500 mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
      />
    </label>
  );
}

export function AdminTextarea({
  label,
  value,
  onChange,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-500 mb-1 block">{label}</span>
      {hint && <p className="text-[10px] text-zinc-600 mb-1">{hint}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-500/50"
      />
    </label>
  );
}

export function AddressRow({ label, address }: { label: string; address?: string }) {
  const display = address && address !== "0x0000000000000000000000000000000000000000" ? address : "—";
  const chainId = useEffectiveChainId();
  const [copied, setCopied] = useState(false);
  const explorer = display.startsWith("0x") ? explorerAddressUrl(chainId, display) : null;

  const copy = async () => {
    if (!display.startsWith("0x")) return;
    await navigator.clipboard.writeText(display);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs py-1">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <code className="px-2 py-0.5 rounded bg-zinc-900 text-cyan-400 font-mono text-[11px]">{display}</code>
      <button type="button" onClick={copy} className="p-1 text-zinc-500 hover:text-white" aria-label="Copy">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      {explorer && (
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-zinc-500 hover:text-cyan-400"
          aria-label="Open in explorer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

/** @deprecated use AddressRow */
export function AddressChip({ label, address }: { label: string; address: string }) {
  return <AddressRow label={label} address={address} />;
}
