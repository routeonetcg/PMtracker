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

async function pickCard(page: Page, search: string) {
  await page.getByPlaceholder("Search name, set, number, cert…").fill(search);
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(search, "i") }).first().click();
}

test.describe.configure({ mode: "serial" });

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/login/);
});

test("phase 1: buy, bulk lot, sell, bundle, trade, expense → dashboard", async ({ page }) => {
  await login(page);

  // 1. Single card, $20 + $1 fees.
  await page.goto("/buy");
  await page.locator("#l1-name").fill("Umbreon V");
  await page.locator("#l1-set").fill("Evolving Skies");
  await page.locator("#l1-num").fill("189/203");
  await page.getByLabel("Price paid").fill("20");
  await page.locator("#fees").fill("1");
  await page.locator("#l1-mkt").fill("35");
  await page.locator("#l1-asking").fill("40");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Umbreon V" })).toBeVisible();
  await expect(page.getByText("$21.00").first()).toBeVisible(); // cost basis

  // 2. Bulk lot: $120 for three cards, split by market value 60/40/20.
  await page.goto("/buy?mode=lot");
  const lot = [
    { key: 1, name: "Lugia V", set: "Silver Tempest", mkt: "60" },
    { key: 2, name: "Giratina V", set: "Lost Origin", mkt: "40" },
  ];
  for (const l of lot) {
    await page.locator(`#l${l.key}-name`).fill(l.name);
    await page.locator(`#l${l.key}-set`).fill(l.set);
    await page.locator(`#l${l.key}-mkt`).fill(l.mkt);
  }
  await page.getByRole("button", { name: "Add another card" }).click();
  await page.locator("#l11-name").fill("Rayquaza VMAX");
  await page.locator("#l11-set").fill("Evolving Skies");
  await page.locator("#l11-mkt").fill("20");
  await page.getByLabel("Total lot price").fill("120");
  // Live preview shows each card's share of the lot.
  await expect(page.getByText("$60.00")).toBeVisible();
  await page.getByRole("button", { name: "Add 3 cards" }).click();
  await expect(page).toHaveURL("/inventory");

  // 3. Sell Umbreon V for $50 with $5 fees → profit $24.
  await page.goto("/sales/new");
  await page.getByRole("button", { name: "Pick a card" }).click();
  await pickCard(page, "Umbreon V");
  await page.getByLabel("Sale price").fill("50");
  await page.getByLabel("Platform fees").fill("5");
  await page.getByRole("button", { name: "Instagram" }).click();
  await page.getByRole("button", { name: "Venmo" }).click();
  await expect(page.getByText("+$24.00")).toBeVisible();
  await page.getByRole("button", { name: "Record sale" }).click();
  await expect(page).toHaveURL("/sales");

  // 4. Bundle: Lugia + Giratina (cost 60 + 40) for $150 cash → profit $50.
  await page.goto("/sales/new");
  await page.getByRole("button", { name: "Pick a card" }).click();
  await pickCard(page, "Lugia V");
  await page.getByRole("button", { name: "Add card (bundle)" }).click();
  await pickCard(page, "Giratina V");
  await page.getByLabel("Sale price").fill("150");
  await expect(page.getByText("+$50.00")).toBeVisible();
  await page.getByRole("button", { name: "Record bundle of 2" }).click();
  await expect(page).toHaveURL("/sales");
  await expect(page.getByText("Bundle · 2 cards")).toBeVisible();

  // 5. Trade Rayquaza VMAX (cost $20) at $30 for a card valued $30 → realized $10.
  await page.goto("/trades/new");
  await page.getByRole("button", { name: "Add" }).first().click();
  await pickCard(page, "Rayquaza VMAX");
  await page.getByLabel("Agreed value").first().fill("30");
  await page.getByRole("button", { name: "Add" }).nth(1).click();
  await page.locator('[id$="-name"]').last().fill("Espeon VMAX");
  await page.locator('[id$="-set"]').last().fill("Evolving Skies");
  await page.locator('[id$="-val"]').last().fill("30");
  await expect(page.getByText("Even", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save trade" }).click();
  await expect(page).toHaveURL("/trades");

  // 6. Expense: $25 table fee.
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("25");
  await page.getByLabel("Category").selectOption("show_table_fee");
  await page.getByLabel("What was it?").fill("Table at local show");
  await page.getByRole("dialog").getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText("Table at local show")).toBeVisible();

  // 7. Dashboard: revenue 50 + 150 + 30 trade = $230; gross 24 + 50 + 10 = $84; net $59.
  await page.goto("/?period=all");
  const tile = (label: string) => page.locator(`[data-kpi="${label}"]`);
  await expect(tile("Revenue")).toContainText("$230");
  await expect(tile("Gross profit")).toContainText("+$84");
  await expect(tile("Net profit")).toContainText("+$59");

  // 8. Validation: an empty sale price is rejected with a friendly message.
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText(/Amount: enter an amount/)).toBeVisible();
});
