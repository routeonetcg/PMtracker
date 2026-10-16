import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the LOCAL stack (pnpm db:start + pnpm dev).
 * Global setup resets the local database, so never point this at production.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "iphone", use: { ...devices["iPhone 15 Pro"], browserName: "chromium", colorScheme: "dark" } }],
});
