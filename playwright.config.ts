import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-wide", use: { viewport: { width: 1280, height: 900 } } },
    { name: "chromium-narrow", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run start -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
