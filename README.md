# Route One TCG HQ

Private back office for Route One TCG: inventory, cost basis, sales, trades, expenses, market prices and profit, built for two partners using it on their phones at card shows.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn-style components (Radix) · Supabase (Postgres, Auth, Storage) · Drizzle ORM · Recharts · Vitest · Playwright · Vercel.

> **Build status:** Phase 1 (inventory, sales, trades, expenses, dashboard) is complete. Phase 2 (market price feeds, price history, alerts), Phase 3 (Show Mode and events) and Phase 4 (grading, partners, reports) come next.

---

## What's in Phase 1

- **Inventory:** raw (NM/LP/MP/HP/DMG) or graded (PSA/BGS/CGC/TAG + grade + cert) cards, with:
  - EN/JP, rarity and variants
  - quantity, location, who holds it, tags, notes and photos
  - status, and a cost basis made of purchase + fees + shipping + grading
  - asking price set by hand or as market × markup
  - fast search, filters, sort, bulk edit, and CSV import/export
- **Buy cards:** one card, or a **bulk lot** bought for one price. The cost is split by market value, percentage, evenly or by hand, with a live preview. Fees and shipping follow the same split.
- **Sales and bundles:** profit = price − platform fees − shipping − cost. A bundle splits its price across the cards by market value. Selling 2 of 5 copies splits the row, so each part keeps its exact share of cost. You can undo a sale.
- **Trades:** several cards out, several in, and cash either way.
  - Cards going out realize profit at the agreed value.
  - Cards coming in cost what you gave up, so uneven valuations never create paper profit.
  - You can undo a trade.
- **Expenses:** grouped by category, linked to an event, with who paid.
- **Dashboard:**
  - Tiles: revenue, gross and net profit, margin, inventory at cost and at market, unrealized P/L, sell-through and average days to sell.
  - Charts: revenue and profit by month, profit by channel, inventory value over time, top 10 cards and slowest movers.
  - Period filter. Cards with a missing cost are flagged so profit isn't silently overstated.
- **Security:** Postgres row-level security lets only the two partner accounts read or write anything. Public sign-up is off.
- **Activity log:** a database trigger records who changed what, and when, on every table.
- **Money:** always integer **cents**, and percentages are integer **basis points**. Splits use the largest-remainder method, so the parts always add up exactly.

---

## Run it locally

You need **Node 20+**, **pnpm** (`corepack enable`) and **Docker** (used by the local Supabase stack).

```bash
pnpm install
cp .env.example .env.local      # then use the local values printed by the next step
pnpm db:start                   # starts local Supabase (Postgres + Auth + Storage) in Docker
pnpm db:reset                   # applies migrations and seeds partners, starting cards and the Gold Coast show
pnpm dev                        # http://localhost:3000
```

`pnpm db:start` prints the local URL and keys. For a local setup, `.env.local` looks like this (these are Supabase's public local-dev defaults):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from db:start>
SUPABASE_SECRET_KEY=<SECRET_KEY from db:start>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
APP_TIMEZONE=America/New_York
PARTNER_1_NAME=Partner A
PARTNER_1_EMAIL=a@routeone.local
PARTNER_2_NAME=Partner B
PARTNER_2_EMAIL=b@routeone.local
PARTNER_PASSWORD=routeone-local
```

On a local database, the seed creates both logins with `PARTNER_PASSWORD`. Sign in as `a@routeone.local` / `routeone-local`.

### Tests

```bash
pnpm test        # unit tests: all money math (lots, sales, bundles, trades, fees, grading, partner balances), metrics, CSV
pnpm typecheck
pnpm lint
pnpm e2e         # Playwright, iPhone viewport. RESETS THE LOCAL DATABASE first, and refuses to run against anything but local.
```

On machines where Playwright can't download its own browser, set `CHROMIUM_PATH=/path/to/chrome`.

---

## Environment variables

| Variable | Where to find it | Used for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Auth and Storage from the browser |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (publishable key) | Browser and server auth |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys (secret key). **Server only, never expose it.** | Signing photo URLs, and the daily price job (Phase 2) |
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port 6543) | All database queries (run as the signed-in user, with RLS) |
| `APP_TIMEZONE` | Optional, default `America/New_York` | What "today" means for dates and periods |
| `PARTNER_1_NAME`, `PARTNER_1_EMAIL`, `PARTNER_2_NAME`, `PARTNER_2_EMAIL` | Your two partners | `pnpm db:seed` creates the partner records |
| `PARTNER_PASSWORD` | Local only | The seed creates local logins with this password |

### Price API keys (Phase 2)

Prices start with free sources and manual entry. Paid providers switch on when their key is present:

| Provider | Variable | Cost |
|---|---|---|
| TCGdex | none | Free, open source |
| PriceCharting (graded, Japanese, sealed) | `PRICECHARTING_TOKEN` | Needs the paid **Legendary** plan. Copy the 40-character token from *Subscription → API/Download*. |

Add keys to `.env.local` locally, and under **Vercel → Project → Settings → Environment Variables** in production. Then redeploy. The app never scrapes sites that forbid it.

---

## Deploy (Supabase + Vercel)

1. **Create a Supabase project** at supabase.com, ideally in a US East region.
2. **Turn off public sign-ups:** Authentication → Sign In / Providers → turn off *Allow new users to sign up*. Keep the **Email** provider on.
3. **Create the two logins:** Authentication → Users → *Add user*. Use each partner's email and a password, and tick *Auto confirm*.
4. **Push the database schema** from your computer:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   pnpm db:push            # applies supabase/migrations (tables, RLS, audit log, storage bucket)
   ```
5. **Seed partners and starting data** against production. Put the production `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local` temporarily, then run:
   ```bash
   pnpm db:seed
   ```
   The seed links each partner record to the login with the same email. Restore your local `.env.local` afterwards.
6. **Deploy to Vercel:** import the GitHub repo at vercel.com/new. Next.js is detected automatically. Add the environment variables from the table above and deploy.
7. **Set the auth site URL** in Supabase → Authentication → URL Configuration to your Vercel URL.

> **Vercel plan:** Vercel's Hobby plan is for personal, non-commercial use. A business should use **Pro**. The Phase 2 daily price job can run on Vercel Cron, or for free on Supabase `pg_cron`. Both are documented when Phase 2 lands.

### Changing the database

Edit `src/db/schema.ts`, then run:

```bash
pnpm db:generate     # writes a new SQL migration into supabase/migrations
pnpm db:reset        # local: re-apply everything and re-seed
pnpm db:push         # production
```

Access rules, triggers and storage policies live in hand-written migrations, for example `supabase/migrations/*_phase1_security.sql`.

---

## Your logo

Put your logo at **`public/logo.png`**. A square image of at least 256×256 works best. The app picks it up automatically and shows a gold "R1" monogram until then.

## CSV import format

Download a template from **Inventory → Import CSV**. It uses the same columns as **Export CSV**.

- **Required:** only `name` and `set`.
- **Condition:** use `NM`, `LP`, `MP`, `HP` or `DMG` for raw cards. For graded cards use `PSA 10` in the condition column, or fill in the separate `grader` and `grade` columns.
- **Lists:** separate `variants` and `tags` with `;`.
- **Cost:** a blank `purchase` means the cost is still missing. Those cards are flagged until you fill it in.

## How the numbers work

- **Cost basis** = purchase + fees + shipping + grading, stored as row totals in cents.
- **Bulk lot:** the lot price, fees and shipping are split across the cards by the method you choose, using the largest-remainder method. For example, $100 split three ways is $33.34 + $33.33 + $33.33.
- **Sale profit** = sale price − platform fees − shipping cost − cost basis. A bundle splits the price by each card's market value, or asking price if there's no market value.
- **Trade:** cards going out realize *agreed value − cost*. Cards coming in cost *out value + cash paid − cash received*, split by their agreed values.
- **Revenue** on the dashboard includes trade values, shown separately in the tile.
- **Net profit** = gross profit − expenses in the period.
- **Sell-through** = cards sold ÷ (cards sold + cards in stock).
- **Inventory value** counts In Stock, Listed, On Hold and In Grading. Personal Collection is excluded.

*Reports in HQ are summaries for your records, not tax advice.*
