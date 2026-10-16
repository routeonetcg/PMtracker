/**
 * Seeds the partner accounts, holders, settings, starting inventory and the
 * first card show. Safe to run more than once: existing rows are left alone.
 *
 *   pnpm db:seed            # uses .env.local
 *
 * On a LOCAL Supabase (127.0.0.1) it also creates the two logins using
 * PARTNER_PASSWORD. In production create the users in Supabase → Authentication
 * (they are linked to their partner record by email automatically).
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing ${k}`);
  return v;
};

const sql = postgres(env("DATABASE_URL"), { prepare: false, max: 1 });

type SeedCard = {
  name: string;
  setName: string;
  setCode?: string;
  number?: string;
  language: "EN" | "JP";
  rarity?: string;
  variants?: string[];
  askingCents?: number;
  notes?: string;
};

const CARDS: SeedCard[] = [
  { name: "M Rayquaza EX", setName: "Ancient Origins", setCode: "AOR", number: "98/98", language: "EN", rarity: "Full Art", variants: ["full_art"], askingCents: 80000, notes: "Near Mint Minus (NM−)." },
  { name: "Charizard ex", setName: "Obsidian Flames", setCode: "OBF", number: "228/197", language: "EN", rarity: "Hyper Rare (Gold)", askingCents: 3500 },
  { name: "Ash-Greninja EX", setName: "XY Black Star Promos", setCode: "XYP", number: "XY133", language: "EN", rarity: "Promo", variants: ["promo"], askingCents: 3000 },
  { name: "Pikachu VMAX", setName: "VMAX Climax", setCode: "S8b", number: "223/184", language: "JP", rarity: "CSR" },
  { name: "Pikachu ex", setName: "Ascended Heroes", number: "277/217", language: "EN", rarity: "Special Illustration Rare" },
  { name: "Pikachu V", setName: "Brilliant Stars", setCode: "BRS", number: "157/172", language: "EN" },
  { name: "Gengar & Mimikyu GX", setName: "Team Up", setCode: "TEU", number: "164/181", language: "EN" },
  { name: "Marshadow & Machamp GX", setName: "Unbroken Bonds", setCode: "UNB", number: "199/214", language: "EN" },
  { name: "Mewtwo", setName: "SV Black Star Promos", setCode: "SVP", number: "052", language: "EN", rarity: "Promo", variants: ["promo"] },
  { name: "Chandelure", setName: "30th Celebration", number: "112/103", language: "JP", rarity: "AR" },
];

async function ensureLogins(partnersToCreate: { email: string }[]) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const isLocal = /127\.0\.0\.1|localhost/.test(url);
  if (!isLocal) {
    console.log("• Production project: skipping login creation (add users in Supabase → Authentication).");
    return;
  }
  const admin = createClient(url, env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
  const password = env("PARTNER_PASSWORD");
  for (const p of partnersToCreate) {
    const { error } = await admin.auth.admin.createUser({ email: p.email, password, email_confirm: true });
    if (error && !/already/i.test(error.message)) throw error;
    console.log(error ? `• Login exists: ${p.email}` : `• Created login: ${p.email}`);
  }
}

async function main() {
  const partnerDefs = [
    { name: env("PARTNER_1_NAME", "Partner One"), email: env("PARTNER_1_EMAIL"), color: "#F5B700", sort: 1 },
    { name: env("PARTNER_2_NAME", "Partner Two"), email: env("PARTNER_2_EMAIL"), color: "#5B8DEF", sort: 2 },
  ];

  await ensureLogins(partnerDefs);

  await sql.begin(async (tx) => {
    for (const p of partnerDefs) {
      const [row] = await tx`
        insert into public.partners (display_name, email, color, user_id)
        values (${p.name}, ${p.email.toLowerCase()}, ${p.color},
                (select id from auth.users where lower(email) = lower(${p.email})))
        on conflict (email) do update set user_id = coalesce(public.partners.user_id, excluded.user_id)
        returning id`;
      await tx`
        insert into public.holders (kind, partner_id, name, sort)
        values ('partner', ${row.id}, ${p.name}, ${p.sort})
        on conflict (partner_id) do nothing`;
    }
    const [biz] = await tx`select id from public.holders where kind = 'business' limit 1`;
    const businessId =
      biz?.id ??
      (await tx`insert into public.holders (kind, name, sort) values ('business', 'Business account', 0) returning id`)[0].id;
    await tx`insert into public.settings (id) values (1) on conflict (id) do nothing`;

    const [{ count }] = await tx`select count(*)::int as count from public.inventory_items`;
    if (count === 0) {
      const [acq] = await tx`
        insert into public.acquisitions (kind, acquired_on, source, notes, paid_by_holder_id)
        values ('opening', current_date, 'Starting inventory', 'Imported when HQ was set up. Fill in costs.', ${businessId})
        returning id`;
      for (const c of CARDS) {
        const [card] = await tx`
          insert into public.cards (name, set_name, set_code, number, language, rarity, variants)
          values (${c.name}, ${c.setName}, ${c.setCode ?? null}, ${c.number ?? null}, ${c.language},
                  ${c.rarity ?? null}, ${c.variants ?? []}::card_variant[])
          returning id`;
        await tx`
          insert into public.inventory_items
            (card_id, quantity, condition_type, raw_condition, status, location, holder_id,
             purchase_cents, acquisition_id, asking_mode, asking_cents, notes)
          values (${card.id}, 1, 'raw', 'NM', 'in_stock', 'binder', ${businessId},
                  null, ${acq.id}, 'manual', ${c.askingCents ?? null}, ${c.notes ?? null})`;
      }
      console.log(`• Added ${CARDS.length} starting cards (cost left blank).`);
    } else {
      console.log("• Inventory already has cards: skipped starting cards.");
    }

    const [ev] = await tx`select id from public.events where name = 'Gold Coast Card Show' and starts_on = '2026-11-14'`;
    if (!ev) {
      await tx`
        insert into public.events (name, starts_on, location, status)
        values ('Gold Coast Card Show', '2026-11-14', 'Stamford Town Center Mall, Stamford, CT', 'planned')`;
      console.log("• Added Gold Coast Card Show (Nov 14, 2026).");
    }
  });
  await sql.end();
  console.log("Seed complete.");
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
