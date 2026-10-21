import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getCurrentSession } from "@/server/auth/session";
import { checkAccountAccess } from "@/server/authorization/account-access";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { user } from "@/server/db/auth-schema";
import { organizations, roleGrants } from "@/server/db/grants-schema";
import {
  caseObservationLinks,
  domainCases,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  caseTransitionEvents,
  domainTasks,
  operationalZones,
  taskAssignments,
  taskFindings,
} from "@/server/db/operations-domain-schema";

/** Server-only role scope. An organization selector from the browser is never trusted. */
export async function findWorkspaceAccess(role: "operator" | "supervisor") {
  const account = await checkAccountAccess();
  if (!account.allowed)
    return {
      allowed: false as const,
      reason: account.reason,
      status: account.status,
    };
  const session = await getCurrentSession();
  if (!session || session.user.id !== account.userId) {
    return {
      allowed: false as const,
      reason: "UNAUTHENTICATED",
      status: 401 as const,
    };
  }
  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(roleGrants)
    .innerJoin(organizations, eq(roleGrants.organizationId, organizations.id))
    .where(
      and(
        eq(roleGrants.userId, account.userId),
        eq(roleGrants.role, role),
        isNull(roleGrants.revokedAt),
      ),
    )
    .orderBy(asc(organizations.name))
    .limit(1);
  if (!org)
    return {
      allowed: false as const,
      reason: "ROLE_OR_SCOPE_DENIED",
      status: 403 as const,
    };
  const access = await checkOperationalAccess(org.id, role);
  if (!access.allowed) return access;
  return {
    allowed: true as const,
    organizationId: org.id,
    organizationName: org.name,
    userId: account.userId,
    userName: session.user.name?.trim() || session.user.email,
    email: session.user.email,
  };
}

/** Each query accepts only a server-resolved organization; call findWorkspaceAccess first. */
export async function listWorkspaceCases(organizationId: string) {
  return getDb()
    .select({
      id: domainCases.id,
      title: domainCases.title,
      status: domainCases.status,
      version: domainCases.version,
      createdAt: domainCases.createdAt,
    })
    .from(domainCases)
    .where(eq(domainCases.organizationId, organizationId))
    .orderBy(desc(domainCases.createdAt), desc(domainCases.id))
    .limit(100);
}

export async function listWorkspaceTasks(organizationId: string) {
  return getDb()
    .select({
      id: domainTasks.id,
      caseId: domainTasks.caseId,
      title: domainTasks.title,
      status: domainTasks.status,
      version: domainTasks.version,
      instructions: domainTasks.instructions,
      safetyNotes: domainTasks.safetyNotes,
      createdAt: domainTasks.createdAt,
      rangerId: taskAssignments.rangerUserId,
      rangerName: user.name,
      assignedAt: taskAssignments.assignedAt,
    })
    .from(domainTasks)
    .leftJoin(
      taskAssignments,
      and(
        eq(taskAssignments.taskId, domainTasks.id),
        isNull(taskAssignments.unassignedAt),
      ),
    )
    .leftJoin(user, eq(taskAssignments.rangerUserId, user.id))
    .where(eq(domainTasks.organizationId, organizationId))
    .orderBy(desc(domainTasks.createdAt), desc(domainTasks.id))
    .limit(100);
}

export async function getWorkspaceCase(organizationId: string, caseId: string) {
  const db = getDb();
  const [record] = await db
    .select({
      id: domainCases.id,
      title: domainCases.title,
      status: domainCases.status,
      version: domainCases.version,
      createdAt: domainCases.createdAt,
    })
    .from(domainCases)
    .where(
      and(
        eq(domainCases.organizationId, organizationId),
        eq(domainCases.id, caseId),
      ),
    )
    .limit(1);
  if (!record) return null;
  const [links, events, tasks] = await Promise.all([
    db
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
        eq(observations.sourceId, observationSources.id),
      )
      .where(
        and(
          eq(caseObservationLinks.organizationId, organizationId),
          eq(caseObservationLinks.caseId, caseId),
          isNull(caseObservationLinks.unlinkedAt),
        ),
      )
      .limit(50),
    db
      .select({
        transitionId: caseTransitionEvents.transitionId,
        fromStatus: caseTransitionEvents.fromStatus,
        toStatus: caseTransitionEvents.toStatus,
        fromVersion: caseTransitionEvents.fromVersion,
        toVersion: caseTransitionEvents.toVersion,
        reason: caseTransitionEvents.reason,
        actorUserId: caseTransitionEvents.actorUserId,
        createdAt: caseTransitionEvents.createdAt,
        taskId: caseTransitionEvents.taskId,
      })
      .from(caseTransitionEvents)
      .where(
        and(
          eq(caseTransitionEvents.organizationId, organizationId),
          eq(caseTransitionEvents.caseId, caseId),
        ),
      )
      .orderBy(desc(caseTransitionEvents.toVersion))
      .limit(100),
    db
      .select({
        id: domainTasks.id,
        title: domainTasks.title,
        status: domainTasks.status,
        version: domainTasks.version,
      })
      .from(domainTasks)
      .where(
        and(
          eq(domainTasks.organizationId, organizationId),
          eq(domainTasks.caseId, caseId),
        ),
      )
      .orderBy(desc(domainTasks.createdAt))
      .limit(30),
  ]);
  return { record, observations: links, events, tasks };
}

export async function getWorkspaceTask(organizationId: string, taskId: string) {
  const db = getDb();
  const [task] = await db
    .select({
      id: domainTasks.id,
      caseId: domainTasks.caseId,
      title: domainTasks.title,
      status: domainTasks.status,
      version: domainTasks.version,
      instructions: domainTasks.instructions,
      safetyNotes: domainTasks.safetyNotes,
      createdAt: domainTasks.createdAt,
      rangerId: taskAssignments.rangerUserId,
      rangerName: user.name,
      assignedAt: taskAssignments.assignedAt,
    })
    .from(domainTasks)
    .leftJoin(
      taskAssignments,
      and(
        eq(taskAssignments.taskId, domainTasks.id),
        isNull(taskAssignments.unassignedAt),
      ),
    )
    .leftJoin(user, eq(taskAssignments.rangerUserId, user.id))
    .where(
      and(
        eq(domainTasks.organizationId, organizationId),
        eq(domainTasks.id, taskId),
      ),
    )
    .limit(1);
  if (!task) return null;
  const findings = await db
    .select({
      id: taskFindings.id,
      summary: taskFindings.summary,
      authorId: taskFindings.authorUserId,
      createdAt: taskFindings.createdAt,
    })
    .from(taskFindings)
    .where(
      and(
        eq(taskFindings.organizationId, organizationId),
        eq(taskFindings.taskId, taskId),
      ),
    )
    .orderBy(desc(taskFindings.createdAt))
    .limit(50);
  return { task, findings };
}

/** Eligible Rangers only. Zone identifiers are organizational, not verified incident points. */
export async function listEligibleRangers(organizationId: string) {
  const data = await getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      applicationEmail: accessApplications.email,
      reviewedAt: accessApplications.reviewedAt,
      reviewedById: accessApplications.reviewedById,
      emailVerifiedAt: accessApplications.emailVerifiedAt,
    })
    .from(roleGrants)
    .innerJoin(user, eq(roleGrants.userId, user.id))
    .innerJoin(userAccess, eq(userAccess.userId, user.id))
    .innerJoin(
      accessApplications,
      eq(accessApplications.id, userAccess.applicationId),
    )
    .where(
      and(
        eq(roleGrants.organizationId, organizationId),
        eq(roleGrants.role, "ranger"),
        isNull(roleGrants.revokedAt),
        eq(userAccess.status, "active"),
        eq(accessApplications.status, "approved"),
      ),
    )
    .orderBy(asc(user.name))
    .limit(100);
  return data
    .filter(
      (x) =>
        x.emailVerified &&
        x.emailVerifiedAt &&
        x.reviewedAt &&
        x.reviewedById &&
        x.email.trim().toLowerCase() ===
          x.applicationEmail.trim().toLowerCase(),
    )
    .map(({ id, name }) => ({ id, name }));
}

export async function listWorkspaceZones(organizationId: string) {
  return getDb()
    .select({
      id: operationalZones.id,
      code: operationalZones.code,
      name: operationalZones.name,
    })
    .from(operationalZones)
    .where(eq(operationalZones.organizationId, organizationId))
    .orderBy(asc(operationalZones.code))
    .limit(100);
}
