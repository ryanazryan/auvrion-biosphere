import { sql } from "drizzle-orm";

import { getDb } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404 });
  }

  try {
    const db = getDb();
    await db.execute(sql`SELECT PostGIS_Version()`);

    return Response.json({
      status: "ok",
      database: "connected",
      postgis: "available",
    });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
