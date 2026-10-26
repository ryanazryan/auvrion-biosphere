import "server-only";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { EXACT_UUID } from "@/server/copilot/decision";
import { readScopedIntelligence } from "@/server/copilot/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
function reply(value: unknown, status = 200) {
  return Response.json(value, { headers: HEADERS, status });
}
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const id = query.get("organizationId");
  const timeZone = query.get("timeZone") ?? "WITA";
  if (
    !["WIB", "WITA", "WIT"].includes(timeZone) ||
    (query.has("timeZone") && query.getAll("timeZone").length !== 1)
  )
    return reply({ error: "INVALID_TIME_ZONE" }, 400);
  if (
    !id ||
    !EXACT_UUID.test(id) ||
    query.size !== (query.has("timeZone") ? 2 : 1) ||
    query.getAll("organizationId").length !== 1
  )
    return reply({ error: "INVALID_REQUEST" }, 400);
  const access = await checkOperationalAccess(id, "operator");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    return reply(
      await readScopedIntelligence(
        access.organizationId,
        timeZone as "WIB" | "WITA" | "WIT",
      ),
    );
  } catch {
    return reply({ error: "INTELLIGENCE_UNAVAILABLE" }, 503);
  }
}
