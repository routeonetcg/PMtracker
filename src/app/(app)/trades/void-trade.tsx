"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { voidTradeAction } from "./actions";

export function VoidTradeButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Undo trade"
      title="Undo trade"
      disabled={pending}
      onClick={() => {
        if (!confirm("Undo this trade? Cards out go back in stock and cards that came in are removed.")) return;
        start(async () => {
          const res = await voidTradeAction(id);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Trade undone");
          router.refresh();
        });
      }}
    >
      <Undo2 />
    </Button>
  );
}
