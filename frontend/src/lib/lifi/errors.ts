export type BridgeErrorLabels = {
  userRejected: string;
  insufficientFunds: string;
  wrongChain: string;
  approvalFailed: string;
  gasFailed: string;
  networkFailed: string;
  rateLimited: string;
  bridgeIncomplete: string;
  switchNetworkFailed: string;
  unknown: string;
};

type ErrLike = {
  message?: string;
  shortMessage?: string;
  details?: string;
  cause?: unknown;
  data?: { message?: string };
};

function asErrLike(err: unknown): ErrLike | null {
  if (!err || typeof err !== "object") return null;
  return err as ErrLike;
}

/** Collect message fragments from nested wallet / viem / Li.FI errors. */
export function collectErrorText(err: unknown, depth = 0): string {
  if (depth > 4) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const parts = [err.message, collectErrorText(err.cause, depth + 1)].filter(Boolean);
    return parts.join(" ");
  }
  const e = asErrLike(err);
  if (!e) return "";
  const parts = [
    e.shortMessage,
    e.message,
    e.details,
    e.data?.message,
    collectErrorText(e.cause, depth + 1),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  return parts.join(" ");
}

export function extractErrorDetail(err: unknown): string | null {
  const text = collectErrorText(err).trim();
  if (!text) return null;
  // Trim noisy viem prefixes while keeping the actionable tail.
  const withoutPrefix = text
    .replace(/^Error:\s*/i, "")
    .replace(/^ContractFunctionExecutionError:\s*/i, "")
    .replace(/^TransactionExecutionError:\s*/i, "")
    .trim();
  const detail = withoutPrefix || text;
  return detail.length > 280 ? `${detail.slice(0, 277)}…` : detail;
}

function matchesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

export function formatBridgeError(err: unknown, labels: BridgeErrorLabels): string {
  const text = collectErrorText(err);

  if (
    matchesAny(text, [
      "user rejected",
      "user denied",
      "rejected the request",
      "action_rejected",
      "4001",
      "cancelled",
      "canceled",
      "user cancelled",
    ])
  ) {
    return labels.userRejected;
  }
  if (
    matchesAny(text, [
      "insufficient funds",
      "insufficient balance",
      "exceeds the balance",
      "transfer amount exceeds balance",
      "not enough",
    ])
  ) {
    return labels.insufficientFunds;
  }
  if (
    matchesAny(text, [
      "wrong network",
      "chain mismatch",
      "does not match quote source chain",
      "unsupported chain",
    ])
  ) {
    return labels.wrongChain;
  }
  if (
    matchesAny(text, [
      'function "approve" reverted',
      "failed to approve",
      "approve failed",
      "erc20: insufficient allowance",
      "insufficient allowance",
    ])
  ) {
    return labels.approvalFailed;
  }
  if (matchesAny(text, ["intrinsic gas", "out of gas", "gas required exceeds", "gas too low"])) {
    return labels.gasFailed;
  }
  if (matchesAny(text, ["rate limit", "429"])) {
    return labels.rateLimited;
  }
  if (matchesAny(text, ["http request failed", "fetch failed", "econnreset", "network error", "timeout", "rpc", "connection"])) {
    return labels.networkFailed;
  }

  const detail = extractErrorDetail(err);
  if (detail) return detail;
  return labels.unknown;
}

const LIFI_SUBSTATUS_LABELS: Record<string, keyof BridgeErrorLabels> = {
  INSUFFICIENT_ALLOWANCE: "approvalFailed",
  INSUFFICIENT_BALANCE: "insufficientFunds",
  REFUNDED: "bridgeIncomplete",
  PARTIAL: "bridgeIncomplete",
  FAILED: "bridgeIncomplete",
};

export function formatLifiBridgeStatus(
  status: string | undefined,
  substatus: string | undefined,
  labels: BridgeErrorLabels
): string | null {
  if (status !== "FAILED") return null;
  const key = substatus ? LIFI_SUBSTATUS_LABELS[substatus] : undefined;
  if (key) return labels[key];
  if (substatus) return `${labels.bridgeIncomplete} (${substatus})`;
  return labels.bridgeIncomplete;
}
