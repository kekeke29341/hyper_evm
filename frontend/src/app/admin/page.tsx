import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";

const ADMIN_ENABLED = process.env.NEXT_PUBLIC_ADMIN_ENABLED === "true";

export const metadata = {
  title: "Admin | Project X",
  description: "Project X admin dashboard — pools, points, airdrop, analytics",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  if (!ADMIN_ENABLED) notFound();
  return <AdminShell />;
}
