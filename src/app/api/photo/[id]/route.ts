import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRls } from "@/db";
import { itemPhotos } from "@/db/schema";
import { getClaims } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

const TTL = 60 * 60;

/**
 * Card photos live in a private bucket. This checks the viewer is a partner
 * (via RLS on item_photos) and redirects to a short-lived signed URL.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/photo/[id]">) {
  const { id } = await ctx.params;
  const claims = await getClaims();
  if (!claims) return new NextResponse("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const [photo] = await withRls(claims, (tx) =>
    tx.select({ path: itemPhotos.storagePath }).from(itemPhotos).where(eq(itemPhotos.id, id)),
  );
  if (!photo) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createAdminClient().storage.from("card-photos").createSignedUrl(photo.path, TTL);
  if (error || !data) return new NextResponse("Not found", { status: 404 });

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": `private, max-age=${TTL - 300}` },
  });
}
