import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

loadEnvFile(".env.local");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const target = new URL(databaseUrl);

if (
  !["postgresql:", "postgres:"].includes(target.protocol) ||
  target.hostname !== "127.0.0.1" ||
  target.port !== "5433" ||
  target.pathname !== "/auvrion_dev" ||
  decodeURIComponent(target.username) !== "auvrion_dev"
) {
  throw new Error(
    "Migration is restricted to the local Auvrion development database",
  );
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
  ],

  out: "./drizzle",

  dbCredentials: {
    url: databaseUrl,
  },
});
