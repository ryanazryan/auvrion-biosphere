import "server-only";

import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  getEnvironmentalContext,
  RegionConfigError,
} from "@/server/environment/context";
import { getObservationEnvironmentalContext } from "@/server/environment/observation-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");
  const observationId = query.get("observationId");
  if (
    !organizationId ||
    !UUID.test(organizationId) ||
    (observationId !== null && !UUID.test(observationId)) ||
    query.getAll("organizationId").length !== 1 ||
    query.getAll("observationId").length > 1 ||
    query.size !== (observationId ? 2 : 1) ||
    [...query.keys()].some(
      (key) => key !== "organizationId" && key !== "observationId",
    )
  )
    return respond({ error: "INVALID_REQUEST" }, 400);

  const access = await checkOperationalAccess(organizationId, "operator");
  if (!access.allowed) return respond({ error: access.reason }, access.status);
  try {
    const data = observationId
      ? await getObservationEnvironmentalContext(
          access.organizationId,
          observationId,
        )
      : await getEnvironmentalContext(access.organizationId);
    return data
      ? respond(data)
      : respond({ error: "OBSERVATION_NOT_FOUND" }, 404);
  } catch (error) {
    return respond(
      {
        error:
          error instanceof RegionConfigError
            ? error.message
            : "ENVIRONMENTAL_CONTEXT_UNAVAILABLE",
      },
      503,
    );
  }
}
