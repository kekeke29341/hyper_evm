import AppShell from "@/components/AppShell";
import { tabPageMetadata } from "@/lib/routes";

export const metadata = tabPageMetadata("dashboard");

export default function Home() {
  return <AppShell activeTab="dashboard" />;
}
