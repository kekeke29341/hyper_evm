import AppShell from "@/components/AppShell";
import { tabPageMetadata } from "@/lib/routes";

export const metadata = tabPageMetadata("deposit");

export default function DepositPage() {
  return <AppShell activeTab="deposit" />;
}
