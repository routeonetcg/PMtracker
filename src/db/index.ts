import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { pg?: postgres.Sql; db?: Db };

function getDb(): Db {
  if (!globalForDb.db) {
    // prepare:false keeps us compatible with Supabase's transaction pooler (port 6543).
    globalForDb.pg = postgres(env.databaseUrl, { prepare: false, max: 5 });
    globalForDb.db = drizzle(globalForDb.pg, { schema });
  }
  return globalForDb.db;
}

export type JwtClaims = { sub: string; role?: string; email?: string; [k: string]: unknown };

/**
 * Run queries as the signed-in user: inside one transaction we switch to the
 * `authenticated` role and set the JWT claims, so Postgres RLS policies apply
 * exactly as they would for a browser request.
 */
export async function withRls<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
                                set_config('request.jwt.claim.sub', ${claims.sub}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

/** Privileged access that bypasses RLS. Only for cron jobs and seeding. */
export function adminDb(): Db {
  return getDb();
}

export { schema };
