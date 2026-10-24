import { defineConfig, devices } from "@playwright/test";

/** WC-014: real browser regression; not part of unit-test CI until test accounts are provisioned. */
export default defineConfig({
  testDir: "./e2e/wc014",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: process.env.WC014_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "tablet-768",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "desktop-1366",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `${process.env.WC014_BASE_URL ?? "http://localhost:3000"}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
