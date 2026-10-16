import { CalendarDays, MapPin, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/display";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { db, requireClaims } from "@/lib/auth";
import { daysBetween, formatDate, todayISO } from "@/lib/dates";
import { listEvents } from "@/server/events";
import { formLookups } from "@/server/lookups";
import { EventDialog } from "./event-form";

export const metadata: Metadata = { title: "Shows" };

export default async function EventsPage() {
  const claims = await requireClaims();
  const today = todayISO();
  const { rows, lookups } = await db(async (tx) => ({ rows: await listEvents(tx), lookups: await formLookups(tx, claims.sub) }));
  const live = rows.filter((r) => r.event.status === "live");
  const upcoming = rows.filter((r) => r.event.status === "planned").sort((a, b) => a.event.startsOn.localeCompare(b.event.startsOn));
  const past = rows.filter((r) => r.event.status === "closed");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shows & events"
        description="Plan shows, sell fast in Show Mode, and reconcile cash at the end of the day."
        actions={<EventDialog holders={lookups.holders} myHolderId={lookups.myHolderId} today={today} />}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="No shows yet">
          Add your next card show to track its table fee, sales and cash.
        </EmptyState>
      ) : null}

      {live.map((r) => (
        <Card key={r.event.id} className="border-primary/50 bg-gradient-to-br from-primary/15 to-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge variant="default" className="mb-1">
                <Zap /> Live now
              </Badge>
              <p className="text-lg font-bold">{r.event.name}</p>
              <p className="text-sm text-muted-foreground">
                {r.salesCount} sales · <Money cents={r.revenueCents} whole />
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/events/${r.event.id}`}>Report</Link>
              </Button>
              <Button asChild size="lg">
                <Link href={`/show/${r.event.id}`}>
                  <Zap /> Show Mode
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      ))}

      <Section title="Upcoming" rows={upcoming} today={today} />
      <Section title="Past shows" rows={past} today={today} />
    </div>
  );
}

function Section({ title, rows, today }: { title: string; rows: Awaited<ReturnType<typeof listEvents>>; today: string }) {
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map(({ event: e, salesCount, revenueCents }) => {
          const days = daysBetween(today, e.startsOn);
          return (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
                <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-muted py-1.5 text-center">
                  <span className="text-[10px] font-semibold text-gold uppercase">{formatDate(e.startsOn).split(" ")[0]}</span>
                  <span className="text-lg leading-none font-bold">{Number(e.startsOn.slice(8, 10))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {e.location ? (
                      <>
                        <MapPin className="size-3" /> {e.location}
                      </>
                    ) : (
                      formatDate(e.startsOn)
                    )}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {e.status === "planned" ? (
                    <Badge variant="info">{days === 0 ? "today" : days > 0 ? `in ${days} days` : "date passed"}</Badge>
                  ) : (
                    <>
                      <Money cents={revenueCents} whole className="block font-semibold" />
                      <span className="text-xs text-muted-foreground">{salesCount} sales</span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
