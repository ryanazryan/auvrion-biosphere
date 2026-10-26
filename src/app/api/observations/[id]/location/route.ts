import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import {
  caseObservationLinks,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  domainTasks,
  taskAssignments,
} from "@/server/db/operations-domain-schema";
import { isUuid } from "@/server/observations/observation-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: HEADERS });

/** Opt-in location disclosure for environmental-risk operational needs only.
 * Biodiversity coordinates are NEVER made available through this route.
 * Production approval/audit remains a separate security gate.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const q = new URL(request.url).searchParams;
  const organizationId = q.get("organizationId");
  if (
    !isUuid(id) ||
    !isUuid(organizationId) ||
    q.size !== 1 ||
    q.getAll("organizationId").length !== 1
  )
    return json({ error: "INVALID_LOCATION_REQUEST" }, 400);

  const operator = await checkOperationalAccess(organizationId, "operator");
  const supervisor = operator.allowed
    ? null
    : await checkOperationalAccess(organizationId, "supervisor");
  const ranger =
    operator.allowed || supervisor?.allowed
      ? null
      : await checkOperationalAccess(organizationId, "ranger");
  const role = operator.allowed
    ? "operator"
    : supervisor?.allowed
      ? "supervisor"
      : ranger?.allowed
        ? "ranger"
        : null;
  if (!role) return json({ error: "LOCATION_ACCESS_DENIED" }, 403);

  // Server configuration is deliberately off by default. Never use NEXT_PUBLIC_ here.
  if (process.env.AUVRION_ENV_RISK_PRECISE_LOCATION !== "YES") {
    return json({ error: "LOCATION_POLICY_NOT_ENABLED" }, 403);
  }

  const db = getDb();
  const [row] = await db
    .select({
      latitude: observations.latitude,
      longitude: observations.longitude,
      domain: observations.domain,
      ingestionMode: observations.ingestionMode,
    })
    .from(observations)
    .where(
      and(
        eq(observations.id, id),
        eq(observations.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (row?.domain !== "environmental_risk") {
    return json({ error: "NOT_FOUND" }, 404);
  }
  if (row.latitude === null || row.longitude === null) {
    return json({ error: "LOCATION_UNKNOWN" }, 404);
  }

  // A Supervisor must be viewing an observation actively attached to a Case.
  // A Ranger must also have a current assignment to that same Case.
  if (role === "supervisor") {
    const [link] = await db
      .select({ id: caseObservationLinks.id })
      .from(caseObservationLinks)
      .where(
        and(
          eq(caseObservationLinks.organizationId, organizationId),
          eq(caseObservationLinks.observationId, id),
          isNull(caseObservationLinks.unlinkedAt),
        ),
      )
      .limit(1);
    if (!link) return json({ error: "LOCATION_NOT_LINKED_TO_CASE" }, 403);
  }
  if (role === "ranger") {
    const rangerId = ranger?.allowed ? ranger.userId : null;
    if (!rangerId) return json({ error: "LOCATION_ACCESS_DENIED" }, 403);
    const [assignment] = await db
      .select({ id: taskAssignments.id })
      .from(caseObservationLinks)
      .innerJoin(
        domainTasks,
        and(
          eq(domainTasks.caseId, caseObservationLinks.caseId),
          eq(domainTasks.organizationId, caseObservationLinks.organizationId),
        ),
      )
      .innerJoin(
        taskAssignments,
        and(
          eq(taskAssignments.taskId, domainTasks.id),
          eq(taskAssignments.organizationId, domainTasks.organizationId),
        ),
      )
      .where(
        and(
          eq(caseObservationLinks.observationId, id),
          eq(caseObservationLinks.organizationId, organizationId),
          isNull(caseObservationLinks.unlinkedAt),
          eq(taskAssignments.rangerUserId, rangerId),
          isNull(taskAssignments.unassignedAt),
          inArray(domainTasks.status, [
            "assigned",
            "accepted",
            "in_progress",
            "blocked",
          ]),
        ),
      )
      .limit(1);
    if (!assignment) return json({ error: "LOCATION_NOT_ASSIGNED" }, 403);
  }

  return json({
    latitude: row.latitude,
    longitude: row.longitude,
    mode: row.ingestionMode,
    locationType: "observation_point",
  });
}
