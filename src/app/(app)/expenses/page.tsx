import { desc, eq } from "drizzle-orm";
import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import { Money } from "@/components/display";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { events, expenses, holders } from "@/db/schema";
import { db, requireClaims } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/lib/labels";
import { formLookups } from "@/server/lookups";
import { ExpenseDialog, ExpenseRowActions } from "./expense-client";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const claims = await requireClaims();
  const { rows, lookups } = await db(async (tx) => ({
    rows: await tx
      .select({ e: expenses, eventName: events.name, holderName: holders.name })
      .from(expenses)
      .leftJoin(events, eq(events.id, expenses.eventId))
      .leftJoin(holders, eq(holders.id, expenses.paidByHolderId))
      .orderBy(desc(expenses.spentOn), desc(expenses.createdAt)),
    lookups: await formLookups(tx, claims.sub),
  }));
  const total = rows.reduce((a, r) => a + r.e.amountCents, 0);
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.e.category, (byCat.get(r.e.category) ?? 0) + r.e.amountCents);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={rows.length ? <>All time: <Money cents={total} /></> : "Table fees, supplies, shipping, travel and more."}
        actions={<ExpenseDialog lookups={lookups} today={todayISO()} />}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<Receipt />} title="No expenses yet">
          Add show table fees, sleeves and toploaders, shipping supplies, travel and subscriptions so net profit is accurate.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[...byCat.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([cat, cents]) => (
                <span key={cat} className="rounded-full border bg-card px-3 py-1 text-xs">
                  {EXPENSE_CATEGORIES[cat as keyof typeof EXPENSE_CATEGORIES]} <Money cents={cents} whole className="font-semibold" />
                </span>
              ))}
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {rows.map(({ e, eventName, holderName }) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(e.spentOn)} · {EXPENSE_CATEGORIES[e.category]}
                    {holderName ? ` · paid by ${holderName}` : ""}
                    {eventName ? ` · ${eventName}` : ""}
                  </p>
                </div>
                <Money cents={e.amountCents} className="font-semibold" />
                <ExpenseRowActions
                  lookups={lookups}
                  today={todayISO()}
                  expense={{
                    id: e.id,
                    spentOn: e.spentOn,
                    category: e.category,
                    amountCents: e.amountCents,
                    description: e.description,
                    eventId: e.eventId,
                    paidByHolderId: e.paidByHolderId,
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
