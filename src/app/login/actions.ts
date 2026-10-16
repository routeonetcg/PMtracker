"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withRls } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { sql } from "drizzle-orm";

export type LoginState = { error?: string; email?: string };

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password is at least 8 characters"),
  next: z.string().startsWith("/").catch("/"),
});

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: "Wrong email or password.", email };

  // Only the partner accounts may use HQ.
  const claims = { sub: data.user.id, role: "authenticated", email: data.user.email };
  const [{ member }] = await withRls(claims, (tx) =>
    tx.execute<{ member: boolean }>(sql`select public.is_member() as member`),
  );
  if (!member) {
    await supabase.auth.signOut();
    return { error: "That account isn't set up as a Route One partner.", email };
  }
  redirect(parsed.data.next.startsWith("//") ? "/" : parsed.data.next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
