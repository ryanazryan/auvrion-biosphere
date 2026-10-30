import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  caseObservationLinks,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import { getCaseObservationEvidence } from "@/server/workflow/observation-evidence";
import { getMyRangerTask } from "./ranger-task-service";

/** Read-only, assigned-only, tenant-scoped metadata. No coordinates or private URLs. */
export async function getAssignedCaseObservations(
  organizationId: string,
  rangerUserId: string,
  taskId: string,
) {
  const task = await getMyRangerTask(organizationId, rangerUserId, taskId);
  if (!task) return null;
  const result = await getDb()
    .select({
      id: observations.id,
      domain: observations.domain,
      quality: observations.quality,
      observedAt: observations.observedAt,
      receivedAt: observations.receivedAt,
      sourceCode: observationSources.code,
      linkReason: caseObservationLinks.linkReason,
    })
    .from(caseObservationLinks)
    .innerJoin(
      observations,
      and(
        eq(observations.id, caseObservationLinks.observationId),
        eq(observations.organizationId, caseObservationLinks.organizationId),
      ),
    )
    .innerJoin(
      observationSources,
      and(
        eq(observationSources.id, observations.sourceId),
        eq(observationSources.organizationId, observations.organizationId),
      ),
    )
    .where(
      and(
        eq(caseObservationLinks.organizationId, organizationId),
        eq(caseObservationLinks.caseId, task.caseId),
        isNull(caseObservationLinks.unlinkedAt),
      ),
    )
    .orderBy(desc(caseObservationLinks.linkedAt))
    .limit(25);
  // Authorization above requires the current assigned Ranger; no cross-task lookup.
  // Evidence projection excludes coordinates, private URLs, and device credentials.
  const evidence = await getCaseObservationEvidence(
    organizationId,
    result.map((item) => item.id),
  );
  return result.map((item) => ({
    ...item,
    evidence: evidence.get(item.id) ?? null,
  }));
}
