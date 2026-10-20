import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { listScopedZones } from "@/server/gis/zone-service";
import { isUuid } from "@/server/observations/observation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers });
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => key !== "organizationId")) {
    return json({ error: "INVALID_FILTER" }, 400);
  }
  const ids = search.getAll("organizationId");
  if (ids.length !== 1 || !isUuid(ids[0])) {
    return json({ error: "INVALID_ORGANIZATION_ID" }, 400);
  }
  const organizationId = ids[0];

  const operator = await checkOperationalAccess(organizationId, "operator");
  if (!operator.allowed) {
    if (operator.reason !== "ROLE_OR_SCOPE_DENIED") {
      return json({ error: operator.reason }, operator.status);
    }
    const supervisor = await checkOperationalAccess(
      organizationId,
      "supervisor",
    );
    if (!supervisor.allowed) {
      return json({ error: supervisor.reason }, supervisor.status);
    }
  }
  try {
    return json({ items: await listScopedZones(organizationId) });
  } catch {
    return json({ error: "GIS_ZONES_UNAVAILABLE" }, 500);
  }
}
