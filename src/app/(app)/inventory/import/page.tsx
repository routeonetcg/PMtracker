import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { INVENTORY_COLUMNS } from "@/lib/csv";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import CSV" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Import inventory from CSV"
        description="Use the same columns as Export CSV. Only name and set are required; blank purchase means “cost missing”."
      />
      <ImportForm columns={[...INVENTORY_COLUMNS]} />
    </div>
  );
}
