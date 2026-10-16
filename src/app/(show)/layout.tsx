import { getCurrentPartner } from "@/lib/auth";

/** Show Mode is full-screen: no sidebar or tab bar, just big buttons. */
export default async function ShowLayout({ children }: { children: React.ReactNode }) {
  await getCurrentPartner(); // partners only
  return <div className="min-h-dvh bg-background">{children}</div>;
}
