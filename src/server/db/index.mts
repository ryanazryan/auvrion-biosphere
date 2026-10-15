import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl } from "./config.mts";

function createDatabase() {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  });

  // Handle idle-connection errors without logging the driver error or secrets.
  pool.on("error", () => console.error("Database connection error."));

  return { pool, db: drizzle({ client: pool, logger: false }) };
}

// One lazy pool per Node process, including across development hot reloads.
const databaseGlobal = globalThis as typeof globalThis & {
  auvrionDatabase?: ReturnType<typeof createDatabase>;
};

export function getDatabase() {
  databaseGlobal.auvrionDatabase ??= createDatabase();
  return databaseGlobal.auvrionDatabase.db;
}

/** Used by local checks to release connections; never call after each request. */
export async function closeDatabase() {
  const connection = databaseGlobal.auvrionDatabase;
  delete databaseGlobal.auvrionDatabase;
  if (connection) await connection.pool.end();
}
