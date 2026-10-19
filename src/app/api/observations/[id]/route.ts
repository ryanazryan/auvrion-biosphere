import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { isUuid } from "@/server/observations/observation-input";
import { getScopedObservation } from "@/server/observations/observation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store", Vary: "Cookie" };
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: responseHeaders });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");
  if (
    !isUuid(id) ||
    !isUuid(organizationId) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  ) {
    return json({ error: "INVALID_OBSERVATION_OR_ORGANIZATION_ID" }, 400);
  }

  const operator = await checkOperationalAccess(organizationId, "operator");
  if (!operator.allowed) {
    if (operator.reason !== "ROLE_OR_SCOPE_DENIED")
      return json({ error: operator.reason }, operator.status);
    const supervisor = await checkOperationalAccess(
      organizationId,
      "supervisor",
    );
    if (!supervisor.allowed)
      return json({ error: supervisor.reason }, supervisor.status);
  }

  try {
    const observation = await getScopedObservation(organizationId, id);
    return observation
      ? json({ observation })
      : json({ error: "NOT_FOUND" }, 404);
  } catch {
    return json({ error: "OBSERVATION_READ_FAILED" }, 500);
  }
}
