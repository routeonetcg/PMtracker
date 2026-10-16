import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type JwtClaims, type Tx, withRls } from "@/db";
import { partners } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

/** Verified JWT claims of the signed-in user, or null. */
export const getClaims = cache(async (): Promise<JwtClaims | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims as JwtClaims;
});

export async function requireClaims(): Promise<JwtClaims> {
  const claims = await getClaims();
  if (!claims) redirect("/login");
  return claims;
}

/** Run a DB callback as the signed-in user with RLS enforced. */
export async function db<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = await requireClaims();
  return withRls(claims, fn);
}

export type CurrentPartner = typeof partners.$inferSelect;

/** The partner record for the signed-in user. Non-partners are sent to /login. */
export const getCurrentPartner = cache(async (): Promise<CurrentPartner> => {
  const claims = await requireClaims();
  const rows = await withRls(claims, (tx) => tx.select().from(partners).where(eq(partners.userId, claims.sub)));
  if (!rows[0]) redirect("/login?error=not-a-partner");
  return rows[0];
});
