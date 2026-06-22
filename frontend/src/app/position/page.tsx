import AppShell from "@/components/AppShell";
import { tabPageMetadata } from "@/lib/routes";

export const metadata = tabPageMetadata("liquidity");

export default function PositionPage() {
  return <AppShell activeTab="liquidity" />;
}
