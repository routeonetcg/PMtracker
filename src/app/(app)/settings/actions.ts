"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { settings } from "@/db/schema";
import { db } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";
import { runAction } from "@/server/action";

export async function saveSettings(input: unknown) {
  return runAction(settingsSchema, input, async (d) => {
    await db((tx) =>
      tx
        .update(settings)
        .set({
          defaultMarkupBps: d.defaultMarkupPct!,
          roundAskingToCents: d.roundAskingTo,
          staleDays: d.staleDays,
          slowMoverDays: d.slowMoverDays,
          ebayFeeBps: d.ebayFeePct!,
          ebayFeeFixedCents: d.ebayFeeFixed,
        })
        .where(eq(settings.id, 1)),
    );
    revalidatePath("/", "layout");
    return true;
  });
}
