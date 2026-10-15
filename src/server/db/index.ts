import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let database: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (!database) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }

    const pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });

    database = drizzle({ client: pool });
  }

  return database;
}
