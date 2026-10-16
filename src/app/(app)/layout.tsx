import { AppShell } from "@/components/app-shell";
import { db, getCurrentPartner } from "@/lib/auth";
import { liveEvent } from "@/server/events";
import { openAlertCountRls } from "@/server/prices/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const partner = await getCurrentPartner();
  const { alertCount, live } = await db(async (tx) => ({ alertCount: await openAlertCountRls(tx), live: await liveEvent(tx) }));
  return (
    <AppShell partner={{ displayName: partner.displayName, color: partner.color }} alertCount={alertCount} liveEvent={live}>
      {children}
    </AppShell>
  );
}
