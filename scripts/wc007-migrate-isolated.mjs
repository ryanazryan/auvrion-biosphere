/**
 * AB-WC-007: guarded migration of the isolated local test database only.
 * Place at repo/scripts/wc007-migrate-isolated.mjs and run from repo root:
 *     node scripts/wc007-migrate-isolated.mjs
 * Never points to your development or production database.
 */
import { loadEnvFile } from "node:process";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  loadEnvFile(".env.local");
  const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (
    !["postgres:", "postgresql:"].includes(dev.protocol) ||
    dev.hostname !== "127.0.0.1" ||
    dev.port !== "5433" ||
    dev.pathname !== "/auvrion_dev" ||
    decodeURIComponent(dev.username) !== "auvrion_dev"
  ) {
    throw new Error(
      "REFUSED: expected the known local development URL (127.0.0.1:5433/auvrion_dev) to derive credentials",
    );
  }

  const files = readMigrationFiles({ migrationsFolder: "./drizzle" });
  console.log(`Migration files detected: ${files.length}`);
  if (files.length !== 12) {
    throw new Error(
      "REFUSED: expected exactly 12 migrations (0000 through 0011)",
    );
  }

  const url = new URL(dev.toString());
  url.hostname = "127.0.0.1";
  url.port = "5435";
  url.pathname = "/auvrion_wc007_test";

  const pool = new Pool({
    connectionString: url.toString(),
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });

  try {
    const identity = await pool.query(
      "SELECT current_database() AS db_name, current_user AS db_user, inet_server_port() AS server_port",
    );
    const server = identity.rows[0];
    console.log("Database:", server.db_name, "User:", server.db_user);
    if (
      server.db_name !== "auvrion_wc007_test" ||
      server.db_user !== "auvrion_dev"
    ) {
      throw new Error("REFUSED: unexpected connected database identity");
    }

    const before = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS applied,
        (SELECT count(*)::int FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys') AS app_tables
    `);
    console.log("Before:", before.rows[0]);

    if (before.rows[0].applied !== 0 || before.rows[0].app_tables !== 0) {
      throw new Error(
        "REFUSED: test database contains some application migrations/tables; do not reset or rerun blindly",
      );
    }

    console.log(
      "Applying pending migrations to the isolated WC-007 database...",
    );
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });

    const after = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS applied,
        (SELECT count(*)::int FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys') AS app_tables,
        (SELECT count(*)::int FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename IN ('organizations', 'user', 'observations', 'domain_cases')) AS essential_tables
    `);
    console.log("After:", after.rows[0]);

    if (after.rows[0].applied !== 12 || after.rows[0].essential_tables !== 4) {
      throw new Error(
        "VERIFICATION FAILED: migration ledger or essential table count mismatch",
      );
    }
    console.log(
      "PASS: 12 migrations applied and essential WC-007 tables exist in isolated database",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("WC-007 isolated migration failed:", error);
  process.exitCode = 1;
});
