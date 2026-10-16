"use client";

import { Camera, Loader2, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { addPhoto, deleteItem, makePrimaryPhoto, removePhoto } from "../actions";

/** Shrink phone photos (often 4–8 MB) to ~1600px JPEG before upload. */
async function resizeImage(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

export function PhotoManager({ itemId, photos }: { itemId: string; photos: { id: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        const blob = await resizeImage(file);
        const path = `${itemId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("card-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw new Error(error.message);
        const res = await addPhoto({ itemId, storagePath: path });
        if (!res.ok) throw new Error(res.error);
      }
      toast.success(files.length === 1 ? "Photo added" : `${files.length} photos added`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {photos.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.id} className="group relative">
              <img src={`/api/photo/${p.id}`} alt="" className="h-20 w-14 rounded-md object-cover ring-1 ring-border" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between p-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                {i > 0 ? (
                  <button aria-label="Make main photo" className="rounded bg-black/70 p-1 text-primary" onClick={async () => { await makePrimaryPhoto(p.id); router.refresh(); }}>
                    <Star className="size-3" />
                  </button>
                ) : <span />}
                <button aria-label="Delete photo" className="rounded bg-black/70 p-1 text-white" onClick={async () => { if (confirm("Delete this photo?")) { await removePhoto(p.id); router.refresh(); } }}>
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : photos.length === 1 ? (
        <button className="text-xs text-muted-foreground underline" onClick={async () => { if (confirm("Delete this photo?")) { await removePhoto(photos[0].id); router.refresh(); } }}>
          Remove photo
        </button>
      ) : null}
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      <Button variant="outline" className="w-full" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}
        {busy ? "Uploading…" : "Add photos"}
      </Button>
    </div>
  );
}

export function DeleteItemButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="lg" className="text-destructive" onClick={() => setOpen(true)}>
        <Trash2 /> Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Delete this card?" description="Use this for mistakes. If you sold or traded it, record a sale or trade instead so profit is tracked.">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteItem(id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Card deleted");
                  router.push("/inventory");
                  router.refresh();
                })
              }
            >
              Delete card
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
