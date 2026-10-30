import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { user } from "@/server/db/auth-schema";
import { roleGrants } from "@/server/db/grants-schema";
import {
  caseObservationLinks,
  domainCases,
} from "@/server/db/observation-domain-schema";
import {
  caseTransitionEvents,
  domainTasks,
  operationalZones,
  taskAssignments,
} from "@/server/db/operations-domain-schema";
import {
  APPROVED_CASE_EDGES,
  type CaseTransitionCommand,
  parseCaseTransitionCommand,
  WorkflowFailure,
} from "./approved-case-policy";

/**
 * Transactional application service only. No API route, client role overrides,
 * auto-created cases, fake Ranger permissions or proposed Task-state actions.
 * `checkOperationalAccess` enforces account, role and current-session MFA.
 * A transaction then locks Case/version plus live actor/Ranger grant rows.
 */
export async function transitionApprovedCase(raw: unknown) {
  const command = parseCaseTransitionCommand(raw);
  const edge = APPROVED_CASE_EDGES[command.transitionId];
  const access = await checkOperationalAccess(
    command.organizationId,
    edge.actor,
  );
  if (!access.allowed) {
    throw new WorkflowFailure(access.status, access.reason);
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    // Hold active authorization row locks until COMMIT; revocations race safely.
    const [actorAccount] = await tx
      .select({ status: userAccess.status })
      .from(userAccess)
      .where(eq(userAccess.userId, access.userId))
      .for("share")
      .limit(1);
    const [actorGrant] = await tx
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
    if (actorAccount?.status !== "active" || !actorGrant) {
      throw new WorkflowFailure(403, "ROLE_OR_SCOPE_DENIED");
    }

    // Row lock serializes all transitions (including concurrent requestId retries).
    const [current] = await tx
      .select({
        id: domainCases.id,
        status: domainCases.status,
        version: domainCases.version,
      })
      .from(domainCases)
      .where(
        and(
          eq(domainCases.id, command.caseId),
          eq(domainCases.organizationId, command.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!current) throw new WorkflowFailure(404, "CASE_NOT_FOUND");

    const [prior] = await tx
      .select({
        transitionId: caseTransitionEvents.transitionId,
        fromVersion: caseTransitionEvents.fromVersion,
        reason: caseTransitionEvents.reason,
        actorUserId: caseTransitionEvents.actorUserId,
        toStatus: caseTransitionEvents.toStatus,
        toVersion: caseTransitionEvents.toVersion,
        taskId: caseTransitionEvents.taskId,
      })
      .from(caseTransitionEvents)
      .where(
        and(
          eq(caseTransitionEvents.caseId, current.id),
          eq(caseTransitionEvents.organizationId, command.organizationId),
          eq(caseTransitionEvents.requestId, command.requestId),
        ),
      )
      .limit(1);
    if (prior) {
      if (
        prior.transitionId !== command.transitionId ||
        prior.fromVersion !== command.expectedVersion ||
        prior.actorUserId !== access.userId ||
        prior.reason !== command.reason
      ) {
        throw new WorkflowFailure(409, "REQUEST_ID_REUSED_WITH_DIFFERENT_DATA");
      }
      await verifyAssignmentReplay(tx, command, prior.taskId);
      return {
        caseId: current.id,
        status: prior.toStatus,
        version: prior.toVersion,
        taskId: prior.taskId,
        replayed: true,
      };
    }
    if (
      current.version !== command.expectedVersion ||
      current.status !== edge.from
    ) {
      throw new WorkflowFailure(409, "CASE_STATE_OR_VERSION_CONFLICT");
    }

    // A Case with no active observation has no reviewable source evidence.
    const [linked] = await tx
      .select({ id: caseObservationLinks.id })
      .from(caseObservationLinks)
      .where(
        and(
          eq(caseObservationLinks.caseId, command.caseId),
          eq(caseObservationLinks.organizationId, command.organizationId),
          isNull(caseObservationLinks.unlinkedAt),
        ),
      )
      .limit(1);
    if (!linked) throw new WorkflowFailure(422, "CASE_OBSERVATION_REQUIRED");

    let taskId: string | null = null;
    if (command.transitionId === "AB-TR-013") {
      const assignment = command.assignment;
      if (!assignment) throw new WorkflowFailure(422, "ASSIGNMENT_REQUIRED");
      // Ranger must have an active, approved account + live grant in the same org.
      const [candidate] = await tx
        .select({
          userId: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          accessStatus: userAccess.status,
          applicationEmail: accessApplications.email,
          applicationStatus: accessApplications.status,
          emailVerifiedAt: accessApplications.emailVerifiedAt,
          reviewedAt: accessApplications.reviewedAt,
          reviewedById: accessApplications.reviewedById,
        })
        .from(user)
        .innerJoin(userAccess, eq(userAccess.userId, user.id))
        .innerJoin(
          accessApplications,
          eq(accessApplications.id, userAccess.applicationId),
        )
        .where(eq(user.id, assignment.rangerUserId))
        .for("share")
        .limit(1);
      const [grant] = await tx
        .select({ id: roleGrants.id })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, assignment.rangerUserId),
            eq(roleGrants.organizationId, command.organizationId),
            eq(roleGrants.role, "ranger"),
            isNull(roleGrants.revokedAt),
          ),
        )
        .for("share")
        .limit(1);
      const eligible =
        candidate?.accessStatus === "active" &&
        candidate.emailVerified &&
        candidate.applicationStatus === "approved" &&
        candidate.emailVerifiedAt !== null &&
        candidate.reviewedAt !== null &&
        candidate.reviewedById !== null &&
        candidate.email.trim().toLowerCase() ===
          candidate.applicationEmail.trim().toLowerCase();
      if (!eligible || !grant)
        throw new WorkflowFailure(422, "RANGER_NOT_ACTIVE_OR_SCOPED");

      // Zone is a verified organization-scoped reference, NOT an exact incident point.
      const [zone] = await tx
        .select({ code: operationalZones.code, name: operationalZones.name })
        .from(operationalZones)
        .where(
          and(
            eq(operationalZones.id, assignment.zoneId),
            eq(operationalZones.organizationId, command.organizationId),
          ),
        )
        .limit(1);
      if (!zone)
        throw new WorkflowFailure(422, "VALID_OPERATIONAL_ZONE_REQUIRED");
      const instructions = formatScopedInstructions(
        zone.code,
        zone.name,
        assignment.instructions,
      );
      const [task] = await tx
        .insert(domainTasks)
        .values({
          organizationId: command.organizationId,
          caseId: command.caseId,
          title: assignment.title,
          instructions,
          safetyNotes: assignment.safetyNotes,
          createdByUserId: access.userId,
          status: "assigned",
        })
        .returning({ id: domainTasks.id });
      if (!task) throw new WorkflowFailure(500, "TASK_CREATION_FAILED");
      taskId = task.id;
      // AUVRION_RANGER_PATCH_20261030: immutable location snapshot for future tasks.
      await tx.execute(sql`
        INSERT INTO ranger_task_location_snapshots (
          task_id, organization_id, zone_id, geometry_version_id,
          source_device_id, location_label, latitude, longitude, verified_at
        )
        SELECT ${task.id}, ${command.organizationId}, z.id, g.id,
               inst.device_id, inst.location_label, inst.latitude, inst.longitude, inst.verified_at
        FROM operational_zones z
        LEFT JOIN LATERAL (
          SELECT gv.id FROM zone_geometry_versions gv
          WHERE gv.zone_id=z.id AND gv.organization_id=z.organization_id
          ORDER BY gv.geometry_version DESC LIMIT 1
        ) g ON true
        LEFT JOIN LATERAL (
          SELECT ir.device_id, l.location_label, l.latitude, l.longitude, l.verified_at
          FROM case_observation_links col
          JOIN observations o ON o.id=col.observation_id
            AND o.organization_id=col.organization_id
          JOIN ingestion_recordings ir ON ir.observation_id=o.id
            AND ir.organization_id=o.organization_id
          JOIN listen_device_installations l ON l.device_id=ir.device_id
            AND l.organization_id=ir.organization_id
          WHERE col.case_id=${command.caseId}
            AND col.organization_id=${command.organizationId}
            AND col.unlinked_at IS NULL AND o.domain='biodiversity'
            AND l.disclosure_approved=true AND l.verified_at <= now()
          ORDER BY l.verified_at DESC LIMIT 1
        ) inst ON true
        WHERE z.id=${assignment.zoneId} AND z.organization_id=${command.organizationId}
        ON CONFLICT (task_id) DO NOTHING
      `);
      await tx.insert(taskAssignments).values({
        organizationId: command.organizationId,
        taskId,
        rangerUserId: assignment.rangerUserId,
        assignedByUserId: access.userId,
        reason: command.reason,
      });
    }

    const [updated] = await tx
      .update(domainCases)
      .set({
        status: edge.to,
        version: sql`${domainCases.version} + 1`,
      })
      .where(
        and(
          eq(domainCases.id, command.caseId),
          eq(domainCases.organizationId, command.organizationId),
          eq(domainCases.version, command.expectedVersion),
          eq(domainCases.status, edge.from),
        ),
      )
      .returning({ id: domainCases.id, version: domainCases.version });
    if (!updated)
      throw new WorkflowFailure(409, "CASE_STATE_OR_VERSION_CONFLICT");

    await tx.insert(caseTransitionEvents).values({
      organizationId: command.organizationId,
      caseId: command.caseId,
      transitionId: command.transitionId,
      fromStatus: edge.from,
      toStatus: edge.to,
      fromVersion: command.expectedVersion,
      toVersion: updated.version,
      requestId: command.requestId,
      actorUserId: access.userId,
      reason: command.reason,
      taskId,
    });
    return {
      caseId: command.caseId,
      status: edge.to,
      version: updated.version,
      taskId,
      replayed: false,
    };
  });
}

function formatScopedInstructions(
  code: string,
  name: string,
  instructions: string,
) {
  return `Operational zone: ${code} (${name})\n\n${instructions}`;
}

/** Transaction callback type follows getDb().transaction without exporting DB internals. */
type TransactionClient = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

async function verifyAssignmentReplay(
  tx: TransactionClient,
  command: CaseTransitionCommand,
  taskId: string | null,
) {
  if (command.transitionId !== "AB-TR-013") {
    if (taskId !== null)
      throw new WorkflowFailure(409, "REQUEST_REPLAY_MISMATCH");
    return;
  }
  const assignment = command.assignment;
  if (!assignment || !taskId)
    throw new WorkflowFailure(409, "REQUEST_REPLAY_MISMATCH");
  const [task] = await tx
    .select({
      title: domainTasks.title,
      instructions: domainTasks.instructions,
      safetyNotes: domainTasks.safetyNotes,
    })
    .from(domainTasks)
    .where(
      and(
        eq(domainTasks.id, taskId),
        eq(domainTasks.caseId, command.caseId),
        eq(domainTasks.organizationId, command.organizationId),
      ),
    )
    .limit(1);
  const [ranger] = await tx
    .select({ userId: taskAssignments.rangerUserId })
    .from(taskAssignments)
    .where(
      and(
        eq(taskAssignments.taskId, taskId),
        eq(taskAssignments.organizationId, command.organizationId),
        isNull(taskAssignments.unassignedAt),
      ),
    )
    .limit(1);
  const [zone] = await tx
    .select({ code: operationalZones.code, name: operationalZones.name })
    .from(operationalZones)
    .where(
      and(
        eq(operationalZones.id, assignment.zoneId),
        eq(operationalZones.organizationId, command.organizationId),
      ),
    )
    .limit(1);
  if (
    !task ||
    !ranger ||
    !zone ||
    task.title !== assignment.title ||
    task.safetyNotes !== assignment.safetyNotes ||
    task.instructions !==
      formatScopedInstructions(zone.code, zone.name, assignment.instructions) ||
    ranger.userId !== assignment.rangerUserId
  ) {
    throw new WorkflowFailure(409, "REQUEST_ID_REUSED_WITH_DIFFERENT_DATA");
  }
}
