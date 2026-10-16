"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/auth";
import { tradeSchema } from "@/lib/validation";
import { runAction } from "@/server/action";
import { createTrade, voidTrade } from "@/server/trades";

export async function createTradeAction(input: unknown) {
  return runAction(tradeSchema, input, async (data) => {
    const res = await db((tx) => createTrade(tx, data));
    revalidatePath("/", "layout");
    return res;
  });
}

export async function voidTradeAction(id: string) {
  return runAction(z.string().uuid(), id, async (tradeId) => {
    await db((tx) => voidTrade(tx, tradeId));
    revalidatePath("/", "layout");
    return tradeId;
  });
}
