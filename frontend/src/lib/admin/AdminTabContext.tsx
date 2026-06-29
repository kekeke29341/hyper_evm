"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminTabId } from "@/components/admin/AdminShell";

type AdminTabContextValue = {
  tab: AdminTabId;
  setTab: (tab: AdminTabId) => void;
};

const AdminTabContext = createContext<AdminTabContextValue | null>(null);

export function AdminTabProvider({
  tab,
  setTab,
  children,
}: AdminTabContextValue & { children: ReactNode }) {
  return <AdminTabContext.Provider value={{ tab, setTab }}>{children}</AdminTabContext.Provider>;
}

export function useAdminTab() {
  const ctx = useContext(AdminTabContext);
  if (!ctx) throw new Error("useAdminTab must be used within AdminTabProvider");
  return ctx;
}
