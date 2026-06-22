const PENDING_REF_KEY = "hyperpool_pending_ref";
const CODE_PREFIX = "hyperpool_ref_code";

export function referralCodeStorageKey(chainId: number, address: string): string {
  return `${CODE_PREFIX}_${chainId}_${address.toLowerCase()}`;
}

export function saveReferralCode(chainId: number, address: string, plainCode: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(referralCodeStorageKey(chainId, address), plainCode.trim());
}

export function loadReferralCode(chainId: number, address: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(referralCodeStorageKey(chainId, address));
}

export function savePendingReferralCode(plainCode: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_REF_KEY, plainCode.trim());
}

export function loadPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PENDING_REF_KEY);
}

export function clearPendingReferralCode(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_REF_KEY);
}

/** Alphanumeric invite codes (4–16 chars). */
export function isValidReferralCodePlain(plain: string): boolean {
  const t = plain.trim();
  return t.length >= 4 && t.length <= 16 && /^[A-Za-z0-9]+$/.test(t);
}

export function buildReferralUrl(origin: string, plainCode: string): string {
  return `${origin}/?ref=${encodeURIComponent(plainCode.trim())}`;
}
