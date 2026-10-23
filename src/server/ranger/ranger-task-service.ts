import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import { userAccess } from "@/server/db/access-schema";
import { roleGrants } from "@/server/db/grants-schema";
import {
  domainTasks,
  taskAssignments,
} from "@/server/db/operations-domain-schema";

/**
 * AB-WC-013 Slice 00 — read-only Ranger task access.
 * Never accepts caller-supplied rangerUserId or exposes exact observation location,
 * private media, Task mutation operations, or other Rangers' assignments.
 * Caller must first pass checkOperationalAccess(org, 'ranger') (session + MFA).
 * Query also rechecks live grant and active account, restricting every row.
 * A revoked assignment cannot be read, even when its task ID is guessed.
 */
const visibleStatuses: (typeof domainTasks.$inferSelect.status)[] = [
  "assigned",
  "accepted",
  "in_progress",
  "blocked",
  "submitted",
  "completed",
  "cancelled",
];

function scopedQuery(
  organizationId: string,
  rangerUserId: string,
  taskId?: string,
) {
  const db = getDb();
  return db
    .select({
      id: domainTasks.id,
      caseId: domainTasks.caseId,
      title: domainTasks.title,
      status: domainTasks.status,
      version: domainTasks.version,
      instructions: domainTasks.instructions,
      safetyNotes: domainTasks.safetyNotes,
      createdAt: domainTasks.createdAt,
      assignedAt: taskAssignments.assignedAt,
    })
    .from(domainTasks)
    .innerJoin(
      taskAssignments,
      and(
        eq(taskAssignments.taskId, domainTasks.id),
        eq(taskAssignments.organizationId, domainTasks.organizationId),
      ),
    )
    .innerJoin(
      roleGrants,
      and(
        eq(roleGrants.userId, taskAssignments.rangerUserId),
        eq(roleGrants.organizationId, taskAssignments.organizationId),
        eq(roleGrants.role, "ranger"),
        isNull(roleGrants.revokedAt),
      ),
    )
    .innerJoin(
      userAccess,
      and(
        eq(userAccess.userId, taskAssignments.rangerUserId),
        eq(userAccess.status, "active"),
      ),
    )
    .where(
      and(
        eq(domainTasks.organizationId, organizationId),
        eq(taskAssignments.rangerUserId, rangerUserId),
        isNull(taskAssignments.unassignedAt),
        inArray(domainTasks.status, visibleStatuses),
        taskId ? eq(domainTasks.id, taskId) : undefined,
      ),
    );
}

export async function listMyRangerTasks(
  organizationId: string,
  rangerUserId: string,
  limit: number,
) {
  const items = await scopedQuery(organizationId, rangerUserId)
    .orderBy(desc(taskAssignments.assignedAt), desc(domainTasks.id))
    .limit(limit);
  return { items, limit };
}

export async function getMyRangerTask(
  organizationId: string,
  rangerUserId: string,
  taskId: string,
) {
  const [task] = await scopedQuery(organizationId, rangerUserId, taskId).limit(
    1,
  );
  return task ?? null;
}
