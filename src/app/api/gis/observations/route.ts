import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  type GisFilter,
  listScopedGisObservations,
} from "@/server/gis/gis-service";
import {
  isUuid,
  parseListObservationsInput,
} from "@/server/observations/observation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const zoneIds = params.getAll("zoneId");

  if (zoneIds.length > 1) {
    return json({ error: "INVALID_ZONE_FILTER" }, 400);
  }

  const zoneId = zoneIds[0];

  if (zoneId !== undefined && !isUuid(zoneId)) {
    return json({ error: "INVALID_ZONE_FILTER" }, 400);
  }

  const observationParams = new URLSearchParams(params);
  observationParams.delete("zoneId");

  const parsed = parseListObservationsInput(observationParams);

  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }

  const organizationId = parsed.value.organizationId;

  // Same current-session assurance and organization
  // checks used by the canonical observations API.
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

  const filter: GisFilter = {
    ...parsed.value,
    ...(zoneId ? { zoneId } : {}),
  };

  try {
    const data = await listScopedGisObservations(filter);
    return json(data);
  } catch {
    return json({ error: "GIS_OBSERVATIONS_UNAVAILABLE" }, 500);
  }
}
