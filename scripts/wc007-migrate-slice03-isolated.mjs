/**
 * WC-007 Slice 03: safely advance isolated DB from migration 0011 to 0012.
 * Refuses any address other than 127.0.0.1:5435/auvrion_wc007_test.
 * Does not reset database, does not touch dev/production, no data cleanup.
 */
import { loadEnvFile } from "node:process";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const TARGET_TABLES = [
  "operational_zones",
  "zone_geometry_versions",
  "observation_zone_matches",
  "domain_tasks",
  "task_assignments",
  "task_findings",
  "evidence_media",
  "evidence_links",
];

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
    throw new Error("REFUSED: unexpected local development DB configuration");
  }
  const target = new URL(dev.toString());
  target.port = "5435";
  target.pathname = "/auvrion_wc007_test";
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "5435" ||
    target.pathname !== "/auvrion_wc007_test"
  ) {
    throw new Error("REFUSED: not the isolated WC-007 test DB");
  }

  const files = readMigrationFiles({ migrationsFolder: "./drizzle" });
  if (files.length !== 13) {
    throw new Error(
      `REFUSED: expected exactly 13 migration files (0000–0012), got ${files.length}`,
    );
  }
  console.log("Migration files detected:", files.length);
  const pool = new Pool({
    connectionString: target.toString(),
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });

  try {
    const check = await pool.query(
      `
      SELECT current_database() AS db,
        current_user AS db_user,
        EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') AS has_postgis,
        (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS applied,
        (SELECT count(*)::int FROM pg_tables
          WHERE schemaname='public' AND tablename <> 'spatial_ref_sys') AS app_tables,
        (SELECT count(*)::int FROM pg_tables
          WHERE schemaname='public' AND tablename = ANY($1::text[])) AS new_tables
    `,
      [TARGET_TABLES],
    );
    const before = check.rows[0];
    console.log("Before:", before);
    if (
      before.db !== "auvrion_wc007_test" ||
      before.db_user !== "auvrion_dev"
    ) {
      throw new Error("REFUSED: database/user identity mismatch");
    }
    if (!before.has_postgis) {
      throw new Error(
        "REFUSED: PostGIS extension not available in isolated DB",
      );
    }
    if (before.applied === 13 && before.new_tables === 8) {
      console.log("PASS: Slice 03 already applied; no action taken");
      return;
    }
    if (
      before.applied !== 12 ||
      before.app_tables !== 24 ||
      before.new_tables !== 0
    ) {
      throw new Error(
        "REFUSED: expected 12 applied migrations, 24 existing app tables, 0 Slice03 tables",
      );
    }
    console.log(
      "Applying ONLY pending Drizzle migrations in isolated WC-007 DB...",
    );
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });

    const result = await pool.query(
      `
      SELECT
        (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS applied,
        (SELECT count(*)::int FROM pg_tables
          WHERE schemaname='public' AND tablename <> 'spatial_ref_sys') AS app_tables,
        (SELECT count(*)::int FROM pg_tables
          WHERE schemaname='public' AND tablename = ANY($1::text[])) AS new_tables
    `,
      [TARGET_TABLES],
    );
    console.log("After:", result.rows[0]);
    if (
      result.rows[0]?.applied !== 13 ||
      result.rows[0]?.new_tables !== 8 ||
      result.rows[0]?.app_tables !== 32
    ) {
      throw new Error(
        "Migration verification FAILED; inspect ledger and tables; do not retry blindly",
      );
    }
    console.log(
      "PASS: 13 migrations and all 8 Slice03 tables verified in isolated PostgreSQL",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("WC007 SLICE03 MIGRATION FAILED:", error);
  process.exitCode = 1;
});
