/** Typed access to environment variables. Throws early with a clear message. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See README → Environment variables.`);
  return v;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabasePublishableKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get timezone() {
    return process.env.APP_TIMEZONE || "America/New_York";
  },
};
