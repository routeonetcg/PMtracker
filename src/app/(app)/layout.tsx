import { AppShell } from "@/components/app-shell";
import { getCurrentPartner } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const partner = await getCurrentPartner();
  return <AppShell partner={{ displayName: partner.displayName, color: partner.color }}>{children}</AppShell>;
}
