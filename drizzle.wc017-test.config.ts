/** Dedicated integration DB migration guard. NEVER targets development or production. */
import { defineConfig } from "drizzle-kit";
import devConfig from "./drizzle.config";

const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
if (
  !["postgres:", "postgresql:"].includes(dev.protocol) ||
  dev.hostname !== "127.0.0.1" ||
  dev.port !== "5433" ||
  dev.pathname !== "/auvrion_dev" ||
  decodeURIComponent(dev.username) !== "auvrion_dev"
) {
  throw new Error("WC017_REFUSING_UNKNOWN_DEV_DATABASE");
}
dev.port = "5435";
dev.pathname = "/auvrion_wc007_test";

export default defineConfig({
  ...devConfig,
  dbCredentials: { url: dev.toString() },
});
