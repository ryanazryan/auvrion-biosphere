import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

loadEnvFile(".env.local");
const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
if (
  !["postgres:", "postgresql:"].includes(dev.protocol) ||
  dev.hostname !== "127.0.0.1" ||
  dev.port !== "5433" ||
  dev.pathname !== "/auvrion_dev" ||
  decodeURIComponent(dev.username) !== "auvrion_dev"
) {
  throw new Error("WC007_REFUSING_UNEXPECTED_LOCAL_DEV_DATABASE");
}
const target = new URL(dev.toString());
target.port = "5434";
target.pathname = "/auvrion_wc004_test";
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "5434" ||
  target.pathname !== "/auvrion_wc004_test"
)
  throw new Error("WC007_REFUSING_NONISOLATED_TEST_DATABASE");
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
    "./src/server/db/observation-domain-schema.ts",
    "./src/server/db/operations-domain-schema.ts",
    "./src/server/db/report-domain-schema.ts",
  ],
  out: "./drizzle",
  dbCredentials: { url: target.toString() },
});
