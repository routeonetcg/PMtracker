import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 2 runs against the OFFLINE SAMPLE price responses (PRICE_FIXTURES=1 in
 * .env.local), so prices are made up but the full flow is real: search a
 * provider, link a card, follow its price, override it, alerts, daily job.
 */
const EMAIL = process.env.E2E_EMAIL ?? "a@routeone.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "routeone-local";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

async function openCard(page: Page, name: string) {
  await page.goto(`/inventory?q=${encodeURIComponent(name)}`);
  await page.locator("ul").getByRole("link", { name: new RegExp(name) }).first().click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function linkTcgdex(page: Page, cardName: string) {
  await page.getByRole("button", { name: "Link price source" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Search" }).click();
  await dialog.getByRole("button", { name: new RegExp(cardName) }).first().click();
  await expect(dialog.getByText("suggested")).toBeVisible();
  await dialog.getByRole("button", { name: "Follow this price" }).click();
  await expect(page.getByText(/Linked — market \$/)).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("cron endpoint requires the secret", async ({ request }) => {
  expect((await request.get("/api/cron/prices")).status()).toBe(401);
  expect((await request.get("/api/cron/prices", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("phase 2: link prices, override, alerts, daily update", async ({ page }) => {
  await login(page);

  // Link three seeded cards to TCGdex.
  for (const name of ["M Rayquaza EX", "Charizard ex", "Pikachu V"]) {
    await openCard(page, name);
    await linkTcgdex(page, name);
    await expect(page.getByText(/TCGplayer · Holofoil · market/).first()).toBeVisible();
  }

  // Price alert on Charizard ex: above $1 fires on the next update.
  await openCard(page, "Charizard ex");
  await page.getByLabel("Alert type").selectOption("above");
  await page.getByLabel("Target price").fill("1");
  await page.getByRole("button", { name: "Add alert" }).click();
  await expect(page.getByText("Market at or above $1.00")).toBeVisible();

  // Manual override wins until we switch back to the feed.
  await openCard(page, "Pikachu V");
  await page.getByLabel("Manual market price (each)").fill("20");
  await page.getByLabel("Source").fill("eBay sold comps");
  await page.getByRole("button", { name: "Override" }).click();
  await expect(page.getByText("manual override")).toBeVisible();
  await expect(page.getByText("$20.00").first()).toBeVisible();
  await page.getByRole("button", { name: /Use feed price/ }).click();
  await expect(page.getByText("manual override")).toHaveCount(0);

  // Run the daily job from the Prices page.
  await page.goto("/prices");
  await expect(page.getByText("Offline sample prices.")).toBeVisible();
  await page.getByRole("button", { name: "Update prices now" }).click();
  await expect(page.getByText(/Updated 3 of 3 prices/)).toBeVisible({ timeout: 30_000 });

  // The alert shows on the dashboard and can be dismissed.
  await page.goto("/");
  await expect(page.getByText(/Charizard ex is at or above your \$1\.00 target/)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss alert" }).first().click();
  await expect(page.getByText(/Charizard ex is at or above/)).toHaveCount(0);

  // Inventory value at market is now counted.
  await expect(page.locator('[data-kpi="Inventory at market"]')).not.toContainText("$0");

  // Card lookup fills in set and number when adding a card.
  await page.goto("/buy");
  await page.locator("#l1-name").fill("Mewtwo");
  await page.getByRole("button", { name: "Look up card" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Mewtwo/ }).first().click();
  await expect(page.locator("#l1-set")).toHaveValue("SV Black Star Promos");
  await expect(page.locator("#l1-num")).toHaveValue("052");
});
