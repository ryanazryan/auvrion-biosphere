import { sql } from "drizzle-orm";
import { closeDatabase, getDatabase } from "../src/server/db/index.mts";

async function checkDatabase() {
  try {
    const result = await getDatabase().transaction(
      (transaction) => transaction.execute<{
        connection_ok: number;
        postgis_available: boolean;
        postgis_enabled: boolean;
      }>(sql`
        SELECT 1 AS connection_ok,
          EXISTS (
            SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'
          ) AS postgis_available,
          EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'postgis'
          ) AS postgis_enabled
      `),
      { accessMode: "read only" },
    );

    const row = result.rows[0];
    if (!row || row.connection_ok !== 1) throw new Error("Database check failed.");

    console.log(JSON.stringify({
      connection: "ok",
      postgis: { available: row.postgis_available, enabled: row.postgis_enabled },
    }, null, 2));

    // Discover only: never CREATE EXTENSION or change any database objects.
    if (!row.postgis_available || !row.postgis_enabled) process.exitCode = 2;
  } finally {
    await closeDatabase();
  }
}

await checkDatabase().catch(() => {
  console.error(
    "Database check failed. Verify local DATABASE_URL, server availability and access. Connection details are not logged.",
  );
  process.exitCode = 1;
});
