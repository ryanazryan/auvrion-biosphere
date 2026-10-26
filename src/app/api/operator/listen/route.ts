import "server-only";
import { Pool } from "pg";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { listListenDevices } from "@/server/device-ingestion/listen-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let pool: Pool | undefined;

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const organizationId = params.get("organizationId");
  if (
    !organizationId ||
    !UUID.test(organizationId) ||
    params.size !== 1 ||
    params.getAll("organizationId").length !== 1
  ) {
    return reply({ error: "INVALID_REQUEST" }, 400);
  }
  const access = await checkOperationalAccess(organizationId, "operator");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    if (!process.env.DATABASE_URL)
      return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
    pool ??= new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    const results = await listListenDevices(pool, access.organizationId);
    return reply(results);
  } catch {
    return reply({ error: "LISTEN_MONITOR_UNAVAILABLE" }, 503);
  }
}
