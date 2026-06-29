/** When true, only wallets in ALLOWED_WALLETS may view app pages (client-side gate). */
export const WALLET_GATE_ENABLED = process.env.NEXT_PUBLIC_WALLET_GATE_ENABLED === "true";

const ETH_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** Parse comma/space/semicolon-separated wallet addresses (build-time env). */
export function parseAllowedWallets(raw: string | undefined): readonly string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const addr = part.trim();
    if (!addr || !ETH_ADDRESS.test(addr)) continue;
    const lower = addr.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

export const ALLOWED_WALLETS = parseAllowedWallets(process.env.NEXT_PUBLIC_ALLOWED_WALLETS);

export function isAllowedWallet(
  address: string | undefined,
  allowlist: readonly string[] = ALLOWED_WALLETS
): boolean {
  if (!address || allowlist.length === 0) return false;
  return allowlist.includes(address.toLowerCase());
}

/** Gate is active only when explicitly enabled and at least one wallet is configured. */
export function isWalletGateActive(
  enabled: boolean = WALLET_GATE_ENABLED,
  allowlist: readonly string[] = ALLOWED_WALLETS
): boolean {
  return enabled && allowlist.length > 0;
}
