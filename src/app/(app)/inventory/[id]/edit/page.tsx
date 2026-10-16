import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/misc";
import { db, requireClaims } from "@/lib/auth";
import { getItem } from "@/server/inventory";
import { formLookups } from "@/server/lookups";
import { EditItemForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit card" };

export default async function EditItemPage({ params }: PageProps<"/inventory/[id]/edit">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const claims = await requireClaims();
  const data = await db(async (tx) => ({ item: await getItem(tx, id), lookups: await formLookups(tx, claims.sub) }));
  if (!data.item) notFound();
  const { item } = data;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${item.card.name}`} description={`#${item.itemNo}`} />
      <EditItemForm item={item} lookups={data.lookups} />
    </div>
  );
}
