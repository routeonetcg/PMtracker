"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth";
import { purchaseSchema } from "@/lib/validation";
import { runAction } from "@/server/action";
import { createPurchase } from "@/server/purchases";

export async function createPurchaseAction(input: unknown) {
  return runAction(purchaseSchema, input, async (data) => {
    const res = await db((tx) => createPurchase(tx, data));
    revalidatePath("/inventory");
    revalidatePath("/");
    return res;
  });
}
