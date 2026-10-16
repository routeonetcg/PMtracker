import { AppShell } from "@/components/app-shell";
import { db, getCurrentPartner } from "@/lib/auth";
import { openAlertCountRls } from "@/server/prices/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const partner = await getCurrentPartner();
  const alertCount = await db((tx) => openAlertCountRls(tx));
  return (
    <AppShell partner={{ displayName: partner.displayName, color: partner.color }} alertCount={alertCount}>
      {children}
    </AppShell>
  );
}
