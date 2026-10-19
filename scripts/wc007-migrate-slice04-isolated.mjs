/** Additive isolated migration helper. Never targets 5433/5434 or remote databases. */
import { loadEnvFile } from "node:process";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

loadEnvFile(".env.local");
const dev = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
if (
  !["postgres:", "postgresql:"].includes(dev.protocol) ||
  dev.hostname !== "127.0.0.1" ||
  dev.port !== "5433" ||
  dev.pathname !== "/auvrion_dev" ||
  decodeURIComponent(dev.username) !== "auvrion_dev"
) {
  throw new Error("REFUSED: unexpected local dev database configuration");
}
const test = new URL(dev.toString());
test.port = "5435";
test.pathname = "/auvrion_wc007_test";
const newTables = ["report_versions", "report_inputs"];
const files = readMigrationFiles({ migrationsFolder: "./drizzle" });
if (files.length !== 14) {
  throw new Error(
    `REFUSED: expected 14 migrations 0000..0013; got ${files.length}`,
  );
}

const pool = new Pool({
  connectionString: test.toString(),
  max: 2,
  connectionTimeoutMillis: 5000,
});

async function counts() {
  const { rows } = await pool.query(
    `SELECT current_database() AS db, current_user AS db_user,
       (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS applied,
       (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys') AS app_tables,
       (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])) AS new_tables,
       EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS has_postgis`,
    [newTables],
  );
  return rows[0];
}

try {
  const before = await counts();
  console.log("Migrations:", files.length, "Before:", before);
  if (
    before.db !== "auvrion_wc007_test" ||
    before.db_user !== "auvrion_dev" ||
    !before.has_postgis
  ) {
    throw new Error("REFUSED: isolated DB identity or PostGIS mismatch");
  }
  if (
    before.applied === 14 &&
    before.app_tables === 34 &&
    before.new_tables === 2
  ) {
    console.log("PASS: Slice04 was already applied and verified");
  } else {
    if (
      before.applied !== 13 ||
      before.app_tables !== 32 ||
      before.new_tables !== 0
    ) {
      throw new Error(
        "REFUSED: expected exactly 13 applied migrations and 32 tables; no automatic reset",
      );
    }
    console.log(
      "Applying pending WC-007 Slice04 migration to isolated DB only...",
    );
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
    const after = await counts();
    console.log("After:", after);
    if (
      after.applied !== 14 ||
      after.app_tables !== 34 ||
      after.new_tables !== 2
    ) {
      throw new Error(
        "FAILED: migration state mismatch; inspect before retrying",
      );
    }
    console.log(
      "PASS: WC-007 Slice04 migration verified (14 migrations, 34 tables)",
    );
  }
} catch (error) {
  console.error("WC-007 Slice04 isolated migration ERROR:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
