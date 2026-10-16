"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expenses } from "@/db/schema";
import { db } from "@/lib/auth";
import { expenseSchema } from "@/lib/validation";
import { runAction } from "@/server/action";

export async function saveExpense(input: unknown) {
  return runAction(expenseSchema.extend({ id: z.string().uuid().optional() }), input, async (d) => {
    const values = {
      spentOn: d.spentOn,
      category: d.category,
      amountCents: d.amount,
      description: d.description,
      eventId: d.eventId,
      paidByHolderId: d.paidByHolderId,
    };
    const id = await db(async (tx) => {
      if (d.id) {
        await tx.update(expenses).set(values).where(eq(expenses.id, d.id));
        return d.id;
      }
      const [row] = await tx.insert(expenses).values(values).returning({ id: expenses.id });
      return row.id;
    });
    revalidatePath("/expenses");
    revalidatePath("/");
    return id;
  });
}

export async function deleteExpense(id: string) {
  return runAction(z.string().uuid(), id, async (expenseId) => {
    await db((tx) => tx.delete(expenses).where(eq(expenses.id, expenseId)));
    revalidatePath("/expenses");
    revalidatePath("/");
    return expenseId;
  });
}
