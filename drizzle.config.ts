import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  // Migrations land where the Supabase CLI applies them (`supabase db reset` / `db push`).
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" },
});
