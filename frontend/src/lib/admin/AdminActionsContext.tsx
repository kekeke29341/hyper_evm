"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAdminActions } from "@/lib/hooks/useAdmin";

type AdminActionsValue = ReturnType<typeof useAdminActions>;

const AdminActionsContext = createContext<AdminActionsValue | null>(null);

export function AdminActionsProvider({ children }: { children: ReactNode }) {
  const actions = useAdminActions();
  return <AdminActionsContext.Provider value={actions}>{children}</AdminActionsContext.Provider>;
}

export function useAdminTx() {
  const ctx = useContext(AdminActionsContext);
  if (!ctx) throw new Error("useAdminTx must be used within AdminActionsProvider");
  return ctx;
}
