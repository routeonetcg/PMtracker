/**
 * LOCAL DEVELOPMENT ONLY: replay the daily price job for the past N days using
 * the offline sample responses, so the history chart and alerts can be tested.
 *
 *   PRICE_FIXTURES=1 pnpm prices:backfill 30
 *
 * Refuses to run unless PRICE_FIXTURES=1 and DATABASE_URL points at the local database.
 */
import { addDays, todayISO } from "@/lib/dates";
import { runPriceJob } from "@/server/prices/job";

async function main() {
  const days = Number(process.argv[2] ?? 30);
  if (process.env.PRICE_FIXTURES !== "1") throw new Error("Set PRICE_FIXTURES=1 — this only replays sample prices.");
  if (!/@(127\.0\.0\.1|localhost):54322\//.test(process.env.DATABASE_URL ?? "")) throw new Error("Local database only.");
  const today = todayISO();
  for (let i = days; i >= 0; i--) {
    const asOf = addDays(today, -i);
    const r = await runPriceJob({ asOf });
    console.log(`${asOf}: ${r.updated}/${r.products} prices, ${r.alertsFired} alerts`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
