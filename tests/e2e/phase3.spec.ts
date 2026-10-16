import { expect, type Page, test } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "a@routeone.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "routeone-local";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

async function search(page: Page, text: string) {
  const box = page.getByLabel("Search inventory");
  await box.fill(text);
}

const stat = (page: Page, label: string) => page.locator("header div").filter({ hasText: new RegExp(`^${label}`) }).last();

test.describe.configure({ mode: "serial" });

test("phase 3: Gold Coast show — start, Show Mode sales, buy, offline sync, close", async ({ page, context }) => {
  await login(page);

  // Set table fee and float on the seeded show.
  await page.goto("/events");
  await page.getByRole("link", { name: /Gold Coast Card Show/ }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByLabel("Table fee", { exact: true }).fill("150");
  await page.getByLabel("Starting cash (float)").fill("200");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Show updated")).toBeVisible();
  await expect(page.getByText("Table fee — Gold Coast Card Show")).toBeVisible();

  // Go live → Show Mode.
  await page.getByRole("button", { name: "Start show" }).click();
  await page.getByRole("button", { name: /Go live/ }).click();
  await expect(page).toHaveURL(/\/show\//);
  await expect(page.getByText("Show Mode", { exact: true })).toBeVisible();

  // Sale 1: Charizard ex at asking ($35), cash — search, tap, tap.
  const t0 = Date.now();
  await search(page, "charizard");
  await page.getByRole("button", { name: /Charizard ex/ }).first().click();
  await expect(page.locator("#sell-price")).toHaveValue("35");
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  await expect(page.getByText("Sold Charizard ex")).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(5000);
  await expect(stat(page, "Cash in box")).toContainText("$235");

  // Sale 2: Ash-Greninja, haggled to $28, Venmo.
  await search(page, "ash-greninja");
  await page.getByRole("button", { name: /Ash-Greninja EX/ }).first().click();
  await page.locator("#sell-price").fill("28");
  await page.getByRole("button", { name: "Venmo", exact: true }).click();
  await expect(page.getByText("Sold Ash-Greninja EX")).toBeVisible();

  // Sale 3 then Undo: Mewtwo $5 card → undo puts it back.
  await search(page, "mewtwo");
  await page.getByRole("button", { name: /Mewtwo/ }).first().click();
  await page.locator("#sell-price").fill("5");
  await page.getByRole("button", { name: /^Card/ }).click();
  await page.locator("[data-sonner-toast]").filter({ hasText: "Sold Mewtwo" }).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Sale undone")).toBeVisible();
  await search(page, "mewtwo");
  await expect(page.getByRole("button", { name: /Mewtwo/ }).first()).toBeVisible();

  // Buy at the table: $10 cash.
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Card name").fill("Snorlax");
  await dlg.getByLabel("Set").fill("Paldea Evolved");
  await dlg.getByLabel("Price paid").fill("10");
  await dlg.getByLabel("Asking price").fill("20");
  await dlg.getByRole("button", { name: "Cash", exact: true }).click();
  await expect(page.getByText(/Bought Snorlax/)).toBeVisible();

  // No signal: the sale is kept on the phone, then syncs.
  await search(page, "pikachu v");
  await page.getByRole("button", { name: /Pikachu V Brilliant Stars/ }).first().click();
  await page.locator("#sell-price").fill("15");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  await expect(page.getByText(/1 sale waiting for signal/)).toBeVisible();
  await context.setOffline(false);
  await page.getByText(/1 sale waiting for signal/).click();
  await expect(page.getByText(/Synced 1 sale/)).toBeVisible();
  await expect(page.getByText(/waiting for signal/)).toHaveCount(0);

  // Report: revenue 35 + 28 + 15 = $78; cash 200 + 35 + 15 − 10 = $240.
  await page.getByRole("link", { name: "Report" }).click();
  await expect(page).toHaveURL(/\/events\//);
  await expect(page.getByText("3 sales · 3 cards")).toBeVisible();
  await expect(page.locator("dl").filter({ hasText: "Should be in the box" })).toContainText("$240.00");
  await expect(page.getByText("Bought 1 card(s) · Cash")).toBeVisible();

  // Close with an exact count.
  await page.getByRole("button", { name: "Close show" }).click();
  await page.getByLabel("Cash counted").fill("240");
  await expect(page.getByText("Exactly right.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close show" }).click();
  await expect(page.getByText("Show closed")).toBeVisible();
  await expect(page.getByText("Exact", { exact: true })).toBeVisible();
});
