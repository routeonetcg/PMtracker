"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runPricesNowAction } from "./actions";

export function RunPricesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await runPricesNowAction();
          if (!res.ok) return void toast.error(res.error);
          const r = res.data;
          toast.success(`Updated ${r.updated} of ${r.products} prices`, {
            description: [r.failed.length ? `${r.failed.length} failed` : null, r.alertsFired ? `${r.alertsFired} new alerts` : null, r.sample ? "sample data" : null]
              .filter(Boolean)
              .join(" · ") || undefined,
          });
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {pending ? "Updating…" : "Update prices now"}
    </Button>
  );
}
