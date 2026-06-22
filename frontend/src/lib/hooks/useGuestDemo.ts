"use client";

import { useApp } from "@/lib/store";

/** True when the visitor has not connected a wallet — show sample UI data. */
export function useGuestDemo() {
  const { isConnected } = useApp();
  return { isGuestDemo: !isConnected };
}
