import { execSync } from "node:child_process";

/** Reset the local Supabase database and re-seed before the run. Refuses to touch anything remote. */
export default function globalSetup() {
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (!/@(127\.0\.0\.1|localhost):54322\//.test(url)) {
    throw new Error("E2E tests only run against the local Supabase database (127.0.0.1:54322).");
  }
  if (process.env.E2E_SKIP_RESET) return;
  execSync("npx supabase db reset", { stdio: "inherit" });
  execSync("pnpm db:seed", { stdio: "inherit" });
}
