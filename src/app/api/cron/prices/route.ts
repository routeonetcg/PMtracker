import { NextResponse } from "next/server";
import { runPriceJob } from "@/server/prices/job";

// Daily price update. Called by Vercel Cron (see vercel.json) or Supabase pg_cron.
// Requires `Authorization: Bearer <CRON_SECRET>`; Vercel Cron sends this automatically.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPriceJob();
    return NextResponse.json(result);
  } catch (e) {
    console.error("price job failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Price job failed" }, { status: 500 });
  }
}
