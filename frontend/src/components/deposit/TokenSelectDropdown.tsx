"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { useLiFiTokens } from "@/lib/hooks/useLiFiTokens";
import { bridgeTokenKey, type BridgeToken } from "@/lib/lifi/tokens";
import { cn } from "@/lib/utils";

const TOKEN_COLORS: Record<string, string> = {
  HYPE: "bg-emerald-500",
  kHYPE: "bg-emerald-500",
  USDC: "bg-blue-500",
  ETH: "bg-indigo-500",
  WETH: "bg-indigo-500",
  WBTC: "bg-orange-500",
  DAI: "bg-yellow-500",
  USDT: "bg-teal-500",
};

function tokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol] ?? TOKEN_COLORS[symbol.toUpperCase()] ?? "bg-zinc-500";
}

function TokenBadge({ token, showChevron }: { token: BridgeToken; showChevron?: boolean }) {
  return (
    <>
      <span className={cn("w-6 h-6 rounded-full shrink-0", tokenColor(token.symbol))} />
      <span className="font-medium max-w-[5.5rem] truncate">{token.symbol}</span>
      {showChevron && <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
    </>
  );
}

export function TokenSelectDropdown({
  chainUiId,
  value,
  onChange,
  excludeSymbol,
  disabled,
  searchPlaceholder,
  popularLabel,
  emptyLabel,
  loadingLabel,
}: {
  chainUiId: string;
  value: BridgeToken;
  onChange?: (token: BridgeToken) => void;
  excludeSymbol?: string;
  disabled?: boolean;
  searchPlaceholder: string;
  popularLabel: string;
  emptyLabel: string;
  loadingLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const { popularTokens, tokens, isLoading } = useLiFiTokens(chainUiId, excludeSymbol, search);

  const visiblePopular = useMemo(() => {
    if (search.trim()) return [];
    return popularTokens;
  }, [popularTokens, search]);

  const listedTokens = useMemo(() => {
    if (search.trim()) return tokens;
    const popularKeys = new Set(visiblePopular.map((token) => bridgeTokenKey(token)));
    return tokens.filter((token) => !popularKeys.has(bridgeTokenKey(token)));
  }, [tokens, visiblePopular, search]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const selectToken = (token: BridgeToken) => {
    onChange?.(token);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (disabled) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800/60 border border-zinc-700 shrink-0">
        <TokenBadge token={value} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-700/60 border border-zinc-600 hover:border-cyan-500/40 transition-colors"
      >
        <TokenBadge token={value} showChevron />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-zinc-800">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700">
              <Search className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                autoFocus
              />
            </div>
          </div>

          <div
            role="listbox"
            className="max-h-52 overflow-y-auto overscroll-contain p-1"
          >
            {isLoading && tokens.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                {loadingLabel}
              </div>
            ) : listedTokens.length === 0 && visiblePopular.length === 0 ? (
              <p className="px-3 py-6 text-xs text-zinc-500 text-center">{emptyLabel}</p>
            ) : (
              <>
                {visiblePopular.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500">
                      {popularLabel}
                    </p>
                    {visiblePopular.map((token) => (
                      <TokenOption
                        key={`popular-${bridgeTokenKey(token)}`}
                        token={token}
                        selected={bridgeTokenKey(token) === bridgeTokenKey(value)}
                        onSelect={selectToken}
                      />
                    ))}
                  </>
                )}
                {listedTokens.length > 0 && (
                  <>
                    {!search.trim() && visiblePopular.length > 0 && (
                      <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-500">
                        Li.FI
                      </p>
                    )}
                    {listedTokens.map((token) => (
                      <TokenOption
                        key={bridgeTokenKey(token)}
                        token={token}
                        selected={bridgeTokenKey(token) === bridgeTokenKey(value)}
                        onSelect={selectToken}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TokenOption({
  token,
  selected,
  onSelect,
}: {
  token: BridgeToken;
  selected: boolean;
  onSelect: (token: BridgeToken) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(token)}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors",
        selected ? "bg-cyan-500/15 text-cyan-300" : "text-zinc-200 hover:bg-zinc-800"
      )}
    >
      <span className={cn("w-5 h-5 rounded-full shrink-0", tokenColor(token.symbol))} />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{token.symbol}</span>
        {token.name && token.name !== token.symbol && (
          <span className="block text-[10px] text-zinc-500 truncate">{token.name}</span>
        )}
      </span>
    </button>
  );
}
