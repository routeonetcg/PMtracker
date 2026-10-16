import { Download, PackagePlus, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/auth";
import { allTags, listHolders, listInventory } from "@/server/inventory";
import { InventoryBrowser } from "./inventory-browser";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const sp = await searchParams;
  const { rows, holders, tags } = await db(async (tx) => ({
    rows: await listInventory(tx),
    holders: await listHolders(tx),
    tags: await allTags(tx),
  }));
  const active = rows.filter((r) => !["sold", "traded"].includes(r.status));

  return (
    <div>
      <PageHeader
        title="Inventory"
        description={`${active.reduce((a, r) => a + r.quantity, 0)} cards on hand · ${rows.length} rows total`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory/import">
                <Upload /> Import CSV
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/inventory/export" download>
                <Download /> Export CSV
              </a>
            </Button>
            <Button asChild size="sm">
              <Link href="/buy">
                <PackagePlus /> Add cards
              </Link>
            </Button>
          </>
        }
      />
      <InventoryBrowser
        rows={rows}
        holders={holders.map((h) => ({ id: h.id, name: h.name }))}
        tags={tags}
        initialFilter={{ cost: sp.cost === "missing" ? "missing" : undefined, q: typeof sp.q === "string" ? sp.q : undefined }}
      />
    </div>
  );
}
