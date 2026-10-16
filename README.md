# Route One TCG HQ

Private back office for Route One TCG: inventory, cost basis, sales, trades, expenses, market prices and profit, built for two partners using it on their phones at card shows.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn-style components (Radix) · Supabase (Postgres, Auth, Storage) · Drizzle ORM · Recharts · Vitest · Playwright · Vercel.

> **Build status:** Phases 1–3 are complete: inventory, sales, trades, expenses and dashboard; market prices, history and alerts; Show Mode and events. Phase 4 (grading, partners, reports) comes next.

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

## What's in Phase 2

- **Link a card to a price source** from its page, using **Link price source**. Search the provider, pick the matching card, then pick which price to follow. The app suggests one based on the card's condition and variant, for example TCGplayer Holofoil market for a raw holo, or PriceCharting PSA 10 for a PSA 10 slab.
- **Daily update:** every morning the price job fetches each linked product once and saves a dated snapshot. Cards that follow the feed get the new price.
- **Manual override:** a price you enter by hand, with its source and date shown, always wins until you tap **Use feed price**.
- **Price history chart** on every card, with dashed lines for cost and asking price.
- **Alerts:**
  - A shop-wide rule flags any card that moves ±X% in N days. You set X and N in Settings; the default is ±15% in 7 days.
  - Per-card rules: goes above $X, goes below $X, or moves ±X% in N days.
  - Open alerts show on the dashboard and the Prices page, and a badge on the menu shows how many. Each one can be dismissed.
- **Stale prices:** any price older than 7 days (configurable) is flagged on the card, in the inventory filters and on the Prices page.
- **Prices page:** cards not linked yet, stale prices, feeds whose last update failed, provider status, the EUR→USD rate, and an **Update prices now** button.
- **Card lookup** when adding cards: search the free TCGdex catalog to fill in set, number, rarity and picture.
- **Market value over time:** the dashboard now shows inventory at market next to inventory at cost.
- **Unrealized P/L** leaves out cards whose cost hasn't been entered, so they don't show up as pure profit.

## What's in Phase 3

- **Shows & events:** name, date (or several days), location, table fee, starting cash and who holds the cash box. The table fee becomes an expense automatically and stays in sync if you edit it. The Gold Coast Card Show (Nov 14, 2026, Stamford Town Center Mall) is already seeded.
- **Start show → Show Mode:** a full-screen screen built for the table.
  - Type a few letters in the big search box, tap the card, then tap how they paid (Cash, Venmo, Zelle, PayPal, Card). The sale is recorded. The price starts at the asking price, with one-tap Ask, Market and −10% buttons for haggling.
  - Each sale shows **Undo** for a few seconds.
  - Card payments take the reader fee from Settings (default 2.6% + 15¢).
  - Running totals at the top: sales, total, **cash in box** and digital.
  - **Buy** and **Trade** buttons for buying a card at the table, or opening a trade.
  - **No signal?** The sale is saved on the phone and syncs automatically when the connection returns, or when you tap the banner. Each sale carries a unique id, so a retry can never record it twice.
- **Where the money goes:** cash goes to whoever holds the cash box, and digital payments go to the partner who made the sale.
- **End-of-show report:**
  - revenue, gross and net profit (after the table fee and other show expenses), and average sale
  - payment breakdown, best sellers, and the buys, trades and expenses at the show
  - the **cash box**: starting cash + cash taken − cash paid out = what should be in the box. **Close show** asks for the counted cash and shows over or short.
- While a show is live, the gold center button on the phone and the top of the sidebar jump straight to Show Mode. The dashboard shows the next or live show.

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
pnpm test        # unit tests: money math (lots, sales, bundles, trades, fees, grading, partner balances), metrics, CSV, price parsers, alerts
pnpm typecheck
pnpm lint
pnpm e2e         # Playwright, iPhone viewport. RESETS THE LOCAL DATABASE first, and refuses to run against anything but local.
                 # The Phase 2 test needs PRICE_FIXTURES=1 in .env.local (it uses the sample price responses).
                 # The Phase 3 test walks through a whole show, including selling with the network switched off.
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
| `CRON_SECRET` | Any long random string (`openssl rand -hex 32`) | Protects `/api/cron/prices`. Vercel Cron sends it automatically. |
| `PRICECHARTING_TOKEN` | Optional, paid. See below. | Turns on PriceCharting (graded, Japanese, sealed) |
| `PRICE_FIXTURES` | **Local development only**, set to `1` | Uses built-in **sample** price responses (made-up prices) when you can't reach the price APIs. Never set this in production. |

### Price sources and API keys

| Provider | Covers | Cost | Key |
|---|---|---|---|
| **TCGdex** (tcgdex.dev) | English catalog and pictures. TCGplayer prices (USD) by variant, and Cardmarket prices (EUR, converted daily with the European Central Bank rate). Japanese catalog, though TCGplayer prices are usually missing for Japanese cards. | Free, open source | none |
| **PriceCharting** | Ungraded and graded prices (PSA, BGS, CGC, SGC 10, and grades 7–9.5), Japanese cards, sealed product | **Paid:** needs the *Legendary* subscription | `PRICECHARTING_TOKEN` |
| Manual | Anything, such as eBay sold comps or show prices | Free | none |

**To turn on PriceCharting:** subscribe to Legendary, go to *Subscription → API/Download*, and copy the 40-character token. Add it as `PRICECHARTING_TOKEN` in `.env.local` locally, or in Vercel → Settings → Environment Variables, then redeploy.

PriceCharting documents `manual-only-price` as the PSA 10 price and `bgs-10-price` as BGS 10. The other grade slots the app uses are the commonly used mapping, but haven't been checked against a live response yet:
- `loose-price` = ungraded
- `cib-price` = grade 7
- `new-price` = grade 8
- `graded-price` = grade 9
- `box-only-price` = grade 9.5
- `condition-17-price` = CGC 10
- `condition-18-price` = SGC 10

After adding the token, link one graded card and compare the prices with the card's page on pricecharting.com.

Not used:
- **pokemontcg.io** is deprecated: no new sign-ups, and existing keys stop working on Mar 1, 2027.
- The **TCGplayer API** is closed to new developers.
- **eBay sold-data APIs** are approval-only.
- **PokemonPriceTracker** and **JustTCG** free tiers are non-commercial.
- The app never scrapes websites.

### The daily price job

`GET /api/cron/prices` with `Authorization: Bearer $CRON_SECRET` runs the update. It is safe to run more than once a day. Pick one way to schedule it:

- **Vercel Cron.** `vercel.json` already schedules it daily at 10:15 UTC, which is about 6am Eastern. Set `CRON_SECRET` in Vercel and it just works. Vercel's Hobby plan is for non-commercial use, so a business should be on Pro.
- **Supabase pg_cron (free).** In the SQL editor, enable the `pg_cron` and `pg_net` extensions, then run:
  ```sql
  select cron.schedule('route-one-prices', '15 10 * * *', $$
    select net.http_get(
      url := 'https://YOUR-APP.vercel.app/api/cron/prices',
      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
      timeout_milliseconds := 290000
    );
  $$);
  ```

You can also run it by hand with **Prices → Update prices now**, or locally with `pnpm prices:run`.

### Trying prices offline

If your machine can't reach the price APIs, add `PRICE_FIXTURES=1` to `.env.local`. The app then uses built-in sample responses with made-up prices, and the Prices page shows an "Offline sample prices" banner. To fill the history chart and trigger some alerts locally, run:

```bash
PRICE_FIXTURES=1 pnpm prices:backfill 30   # replays 30 days of sample prices (local database only)
```

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
6. **Deploy to Vercel:** import the GitHub repo at vercel.com/new. Next.js is detected automatically. Add the environment variables from the table above, including `CRON_SECRET`, and deploy. The daily price job is picked up from `vercel.json`.
7. **Set the auth site URL** in Supabase → Authentication → URL Configuration to your Vercel URL.

> **Vercel plan:** Vercel's Hobby plan is for personal, non-commercial use. A business should use **Pro**. If you'd rather not pay for Vercel Cron, the daily price job can also run on Supabase `pg_cron` (see *The daily price job* above).

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
