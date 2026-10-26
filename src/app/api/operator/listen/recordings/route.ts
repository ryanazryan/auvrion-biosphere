import "server-only";
import { Pool } from "pg";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { listDeviceRecordings } from "@/server/device-ingestion/listen-recordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let pool: Pool | undefined;

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");
  const deviceId = query.get("deviceId");
  if (
    !organizationId ||
    !deviceId ||
    !UUID.test(organizationId) ||
    !UUID.test(deviceId) ||
    query.size !== 2 ||
    query.getAll("organizationId").length !== 1 ||
    query.getAll("deviceId").length !== 1
  )
    return reply({ error: "INVALID_REQUEST" }, 400);

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
    const result = await listDeviceRecordings(
      pool,
      access.organizationId,
      deviceId,
    );
    if (!result) return reply({ error: "DEVICE_NOT_FOUND" }, 404);
    return reply(result);
  } catch {
    return reply({ error: "LISTEN_RECORDINGS_UNAVAILABLE" }, 503);
  }
}
