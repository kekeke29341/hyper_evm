import AppShell from "@/components/AppShell";
import { tabPageMetadata } from "@/lib/routes";

export const metadata = tabPageMetadata("cashdrop");

export default function CashdropPage() {
  return <AppShell activeTab="cashdrop" />;
}
