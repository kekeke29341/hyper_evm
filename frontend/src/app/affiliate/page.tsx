import AppShell from "@/components/AppShell";
import { tabPageMetadata } from "@/lib/routes";

export const metadata = tabPageMetadata("affiliate");

export default function AffiliatePage() {
  return <AppShell activeTab="affiliate" />;
}
