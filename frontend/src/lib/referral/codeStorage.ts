import { getAddress, type Address } from "viem";

const PENDING_REFERRER_KEY = "hyperpool_pending_referrer";

export function savePendingReferrerAddress(referrer: Address): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_REFERRER_KEY, getAddress(referrer));
}

export function loadPendingReferrerAddress(): Address | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PENDING_REFERRER_KEY);
  if (!raw) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

export function clearPendingReferrerAddress(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_REFERRER_KEY);
}

/** Shareable link — works on any device once the referrer is registered on-chain. */
export function buildReferralUrl(origin: string, referrerAddress: string): string {
  return `${origin}/affiliate?referrer=${getAddress(referrerAddress)}`;
}

/** Parse ?referrer=0x… from an invite URL. */
export function parseReferralSearchParams(search: string): { referrerAddress: Address | null } {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const referrerParam = params.get("referrer")?.trim();
  if (!referrerParam) return { referrerAddress: null };
  try {
    return { referrerAddress: getAddress(referrerParam) };
  } catch {
    return { referrerAddress: null };
  }
}

export function captureReferralFromLocation(): void {
  if (typeof window === "undefined") return;
  const { referrerAddress } = parseReferralSearchParams(window.location.search);
  if (referrerAddress) savePendingReferrerAddress(referrerAddress);
}
