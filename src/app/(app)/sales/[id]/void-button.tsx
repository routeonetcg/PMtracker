"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { voidSaleAction } from "../actions";

export function VoidSaleButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Undo2 /> Undo sale
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Undo this sale?" description="The cards go back in stock and the sale is removed. It stays in the activity log.">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await voidSaleAction(id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Sale undone — cards are back in stock");
                  router.push("/sales");
                  router.refresh();
                })
              }
            >
              Undo sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
