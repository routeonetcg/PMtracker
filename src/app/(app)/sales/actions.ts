"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/auth";
import { saleSchema } from "@/lib/validation";
import { runAction } from "@/server/action";
import { createSale, voidSale } from "@/server/sales";

export async function createSaleAction(input: unknown) {
  return runAction(saleSchema, input, async (data) => {
    const res = await db((tx) => createSale(tx, data));
    revalidatePath("/", "layout");
    return res;
  });
}

export async function voidSaleAction(id: string) {
  return runAction(z.string().uuid(), id, async (saleId) => {
    await db((tx) => voidSale(tx, saleId));
    revalidatePath("/", "layout");
    return saleId;
  });
}
