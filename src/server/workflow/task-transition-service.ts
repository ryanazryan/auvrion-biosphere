import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { userAccess } from "@/server/db/access-schema";
import { roleGrants } from "@/server/db/grants-schema";
import {
  domainTasks,
  taskAssignments,
  taskFindings,
  taskTransitionEvents,
} from "@/server/db/operations-domain-schema";
import {
  APPROVED_TASK_EDGES,
  isTaskWorkflowUuid,
  parseTaskCommand,
  TaskWorkflowFailure,
} from "./approved-task-policy";

function hasInvalidControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
}

/** Version-locked, tenant-scoped Task transition with an immutable audit event. */
export async function transitionApprovedTask(raw: unknown) {
  const command = parseTaskCommand(raw);
  const edge = APPROVED_TASK_EDGES[command.transitionId];
  const access = await checkOperationalAccess(
    command.organizationId,
    edge.actor,
  );
  if (!access.allowed)
    throw new TaskWorkflowFailure(access.status, access.reason);

  return getDb().transaction(async (tx) => {
    // Protect authorization from concurrent deactivation/revocation.
    const [account] = await tx
      .select({ status: userAccess.status })
      .from(userAccess)
      .where(eq(userAccess.userId, access.userId))
      .for("share")
      .limit(1);
    const [grant] = await tx
      .select({ id: roleGrants.id })
      .from(roleGrants)
      .where(
        and(
          eq(roleGrants.userId, access.userId),
          eq(roleGrants.organizationId, command.organizationId),
          eq(roleGrants.role, edge.actor),
          isNull(roleGrants.revokedAt),
        ),
      )
      .for("share")
      .limit(1);
    if (account?.status !== "active" || !grant) {
      throw new TaskWorkflowFailure(403, "TASK_ACTOR_ACCESS_REVOKED");
    }

    const [task] = await tx
      .select({
        id: domainTasks.id,
        status: domainTasks.status,
        version: domainTasks.version,
      })
      .from(domainTasks)
      .where(
        and(
          eq(domainTasks.id, command.taskId),
          eq(domainTasks.organizationId, command.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!task) throw new TaskWorkflowFailure(404, "TASK_NOT_FOUND");

    const [assignment] = await tx
      .select({ rangerId: taskAssignments.rangerUserId })
      .from(taskAssignments)
      .where(
        and(
          eq(taskAssignments.taskId, command.taskId),
          eq(taskAssignments.organizationId, command.organizationId),
          isNull(taskAssignments.unassignedAt),
        ),
      )
      .for("share")
      .limit(1);
    if (!assignment) throw new TaskWorkflowFailure(409, "TASK_NOT_ASSIGNED");
    if (edge.actor === "ranger" && assignment.rangerId !== access.userId) {
      throw new TaskWorkflowFailure(404, "TASK_NOT_FOUND");
    }

    const [prior] = await tx
      .select({
        transitionId: taskTransitionEvents.transitionId,
        fromVersion: taskTransitionEvents.fromVersion,
        toVersion: taskTransitionEvents.toVersion,
        toStatus: taskTransitionEvents.toStatus,
        actorUserId: taskTransitionEvents.actorUserId,
        reason: taskTransitionEvents.reason,
      })
      .from(taskTransitionEvents)
      .where(
        and(
          eq(taskTransitionEvents.taskId, command.taskId),
          eq(taskTransitionEvents.organizationId, command.organizationId),
          eq(taskTransitionEvents.requestId, command.requestId),
        ),
      )
      .limit(1);
    if (prior) {
      if (
        prior.actorUserId !== access.userId ||
        prior.transitionId !== command.transitionId ||
        prior.fromVersion !== command.expectedVersion ||
        prior.reason !== command.reason
      ) {
        throw new TaskWorkflowFailure(409, "TASK_IDEMPOTENCY_MISMATCH");
      }
      return {
        taskId: task.id,
        status: prior.toStatus,
        version: prior.toVersion,
        replayed: true,
      };
    }
    if (task.version !== command.expectedVersion || task.status !== edge.from) {
      throw new TaskWorkflowFailure(409, "TASK_STATE_OR_VERSION_CONFLICT");
    }
    if (command.transitionId === "AB-TR-028") {
      const [finding] = await tx
        .select({ id: taskFindings.id })
        .from(taskFindings)
        .where(
          and(
            eq(taskFindings.taskId, task.id),
            eq(taskFindings.organizationId, command.organizationId),
            eq(taskFindings.authorUserId, access.userId),
          ),
        )
        .limit(1);
      if (!finding)
        throw new TaskWorkflowFailure(422, "RANGER_FINDING_REQUIRED");
    }

    const [updated] = await tx
      .update(domainTasks)
      .set({
        status: edge.to,
        version: sql`${domainTasks.version} + 1`,
      })
      .where(
        and(
          eq(domainTasks.id, task.id),
          eq(domainTasks.organizationId, command.organizationId),
          eq(domainTasks.version, task.version),
          eq(domainTasks.status, edge.from),
        ),
      )
      .returning({ version: domainTasks.version, status: domainTasks.status });
    if (!updated)
      throw new TaskWorkflowFailure(409, "TASK_STATE_OR_VERSION_CONFLICT");

    await tx.insert(taskTransitionEvents).values({
      organizationId: command.organizationId,
      taskId: task.id,
      transitionId: command.transitionId,
      fromStatus: edge.from,
      toStatus: edge.to,
      fromVersion: command.expectedVersion,
      toVersion: updated.version,
      actorUserId: access.userId,
      requestId: command.requestId,
      reason: command.reason,
    });
    return {
      taskId: task.id,
      status: updated.status,
      version: updated.version,
      replayed: false,
    };
  });
}

/** Ranger finding: scoped, active assignment, in-progress only, idempotent request. */
export async function createRangerFinding(raw: unknown) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TaskWorkflowFailure(400, "INVALID_FINDING");
  }
  const v = raw as Record<string, unknown>;
  const parsed = parseFindingInput(v);
  const access = await checkOperationalAccess(parsed.organizationId, "ranger");
  if (!access.allowed)
    throw new TaskWorkflowFailure(access.status, access.reason);
  return getDb().transaction(async (tx) => {
    const [account] = await tx
      .select({ status: userAccess.status })
      .from(userAccess)
      .where(eq(userAccess.userId, access.userId))
      .for("share")
      .limit(1);
    const [grant] = await tx
      .select({ id: roleGrants.id })
      .from(roleGrants)
      .where(
        and(
          eq(roleGrants.userId, access.userId),
          eq(roleGrants.organizationId, parsed.organizationId),
          eq(roleGrants.role, "ranger"),
          isNull(roleGrants.revokedAt),
        ),
      )
      .for("share")
      .limit(1);
    if (account?.status !== "active" || !grant)
      throw new TaskWorkflowFailure(403, "RANGER_ACCESS_REVOKED");
    const [task] = await tx
      .select({ status: domainTasks.status })
      .from(domainTasks)
      .where(
        and(
          eq(domainTasks.id, parsed.taskId),
          eq(domainTasks.organizationId, parsed.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!task) throw new TaskWorkflowFailure(404, "TASK_NOT_FOUND");
    const [assigned] = await tx
      .select({ id: taskAssignments.id })
      .from(taskAssignments)
      .where(
        and(
          eq(taskAssignments.taskId, parsed.taskId),
          eq(taskAssignments.organizationId, parsed.organizationId),
          eq(taskAssignments.rangerUserId, access.userId),
          isNull(taskAssignments.unassignedAt),
        ),
      )
      .for("share")
      .limit(1);
    if (!assigned) throw new TaskWorkflowFailure(404, "TASK_NOT_FOUND");
    const [prior] = await tx
      .select({ id: taskFindings.id, summary: taskFindings.summary })
      .from(taskFindings)
      .where(
        and(
          eq(taskFindings.taskId, parsed.taskId),
          eq(taskFindings.organizationId, parsed.organizationId),
          eq(taskFindings.authorUserId, access.userId),
          eq(taskFindings.requestId, parsed.requestId),
        ),
      )
      .limit(1);
    if (prior) {
      if (prior.summary !== parsed.summary)
        throw new TaskWorkflowFailure(409, "FINDING_IDEMPOTENCY_MISMATCH");
      return { findingId: prior.id, replayed: true };
    }
    if (task.status !== "in_progress")
      throw new TaskWorkflowFailure(409, "TASK_NOT_IN_PROGRESS");
    const [created] = await tx
      .insert(taskFindings)
      .values({
        organizationId: parsed.organizationId,
        taskId: parsed.taskId,
        authorUserId: access.userId,
        summary: parsed.summary,
        requestId: parsed.requestId,
      })
      .returning({ id: taskFindings.id });
    if (!created) throw new TaskWorkflowFailure(500, "FINDING_CREATION_FAILED");
    return { findingId: created.id, replayed: false };
  });
}

function parseFindingInput(v: Record<string, unknown>) {
  if (
    !isTaskWorkflowUuid(v.organizationId) ||
    !isTaskWorkflowUuid(v.taskId) ||
    !isTaskWorkflowUuid(v.requestId) ||
    typeof v.summary !== "string" ||
    v.summary.trim().length < 20 ||
    v.summary.length > 2000 ||
    hasInvalidControlCharacters(v.summary)
  ) {
    throw new TaskWorkflowFailure(400, "INVALID_FINDING");
  }
  return {
    organizationId: v.organizationId,
    taskId: v.taskId,
    requestId: v.requestId,
    summary: v.summary.trim(),
  };
}
