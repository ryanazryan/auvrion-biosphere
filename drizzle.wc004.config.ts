import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

// AB-WC-004: test-only Drizzle configuration; NEVER change the development DB.
loadEnvFile(".env.local");

const developmentUrl = new URL(
  process.env.DATABASE_URL ?? "postgres://invalid",
);
if (
  !["postgresql:", "postgres:"].includes(developmentUrl.protocol) ||
  developmentUrl.hostname !== "127.0.0.1" ||
  developmentUrl.port !== "5433" ||
  developmentUrl.pathname !== "/auvrion_dev" ||
  decodeURIComponent(developmentUrl.username) !== "auvrion_dev"
) {
  throw new Error("WC004_REFUSING_UNEXPECTED_DEVELOPMENT_DATABASE");
}

const testUrl = new URL(developmentUrl.toString());
testUrl.port = "5434";
testUrl.pathname = "/auvrion_wc004_test";

if (
  testUrl.hostname !== "127.0.0.1" ||
  testUrl.port !== "5434" ||
  testUrl.pathname !== "/auvrion_wc004_test"
) {
  throw new Error("WC004_REFUSING_NONLOCAL_TEST_DATABASE");
}

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/server/db/auth-schema.ts",
    "./src/server/db/access-schema.ts",
    "./src/server/db/access-verification-schema.ts",
    "./src/server/db/access-decision-audit-schema.ts",
    "./src/server/db/grants-schema.ts",
    "./src/server/db/mfa-assurance-schema.ts",
    "./src/server/db/access-status-schema.ts",
    "./src/server/db/access-decision-notification-schema.ts",
    "./src/server/db/account-activation-schema.ts",
    "./src/server/db/access-lifecycle-audit-schema.ts",
  ],
  out: "./drizzle",
  dbCredentials: { url: testUrl.toString() },
});
