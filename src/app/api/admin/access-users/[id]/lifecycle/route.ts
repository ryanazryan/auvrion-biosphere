import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import {
  isLifecycleAction,
  isLifecycleReason,
  planLifecycleTransition,
} from "@/server/access-lifecycle/policy";
import {
  isLocalActivationRequest,
  jsonError,
  NO_STORE,
  readSmallJson,
} from "@/server/account-activation/http";
import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { accessLifecycleAudit } from "@/server/db/access-lifecycle-audit-schema";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { session, user } from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
type Outcome =
  | { ok: true; outcome: string }
  | { ok: false; code: string; status: number };

const AUDIT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalid = (code: string, status = 409): Outcome => ({
  ok: false,
  code,
  status,
});

export async function POST(request: Request, context: Context) {
  if (!onboardingEnabled(process.env)) return jsonError("NOT_FOUND", 404);
  if (!isLocalActivationRequest(request))
    return jsonError("INVALID_ORIGIN", 403);

  const { id: targetUserId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetUserId))
    return jsonError("INVALID_USER_ID", 400);

  let input: Record<string, unknown>;
  try {
    input = await readSmallJson(request);
  } catch {
    return jsonError("INVALID_REQUEST", 400);
  }
  if (
    !isLifecycleAction(input.action) ||
    !isLifecycleReason(input.reason) ||
    (input.action !== "set_role" && input.role !== undefined) ||
    !("expectedLifecycleAuditId" in input) ||
    (input.expectedLifecycleAuditId !== null &&
      (typeof input.expectedLifecycleAuditId !== "string" ||
        !AUDIT_UUID.test(input.expectedLifecycleAuditId)))
  )
    return jsonError("INVALID_LIFECYCLE_REQUEST", 400);

  const db = getDb();
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);
  if (!organization) return jsonError("ORG_NOT_CONFIGURED", 503);

  const admin = await checkAdminAccess(organization.id, "manage_access");
  if (!admin.allowed) return jsonError(admin.reason, admin.status);
  if (admin.userId === targetUserId)
    return jsonError("SELF_LIFECYCLE_CHANGE_DENIED", 403);

  const reason = input.reason.trim();
  const action = input.action;
  let outcome: Outcome;
  try {
    outcome = await db.transaction(async (tx): Promise<Outcome> => {
      // Serialize ALL lifecycle mutations for this user on a single row lock.
      const [access] = await tx
        .select({
          userId: userAccess.userId,
          applicationId: userAccess.applicationId,
          status: userAccess.status,
        })
        .from(userAccess)
        .where(eq(userAccess.userId, targetUserId))
        .limit(1)
        .for("update");
      if (!access) return invalid("TARGET_NOT_FOUND", 404);

      // Local-v1 organization association is proven by an existing scoped grant,
      // including previously revoked grants; never trust organizationId from input.
      const [scoped] = await tx
        .select({ id: roleGrants.id })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, targetUserId),
            eq(roleGrants.organizationId, organization.id),
          ),
        )
        .limit(1);
      if (!scoped) return invalid("TARGET_SCOPE_DENIED", 403);

      // Admin privileges are a separate capability system. This operational
      // lifecycle endpoint deliberately cannot mutate an administrator.
      const [privileged] = await tx
        .select({ id: adminCapabilityGrants.id })
        .from(adminCapabilityGrants)
        .where(
          and(
            eq(adminCapabilityGrants.userId, targetUserId),
            isNull(adminCapabilityGrants.revokedAt),
          ),
        )
        .limit(1);
      if (privileged) return invalid("PRIVILEGED_TARGET_REQUIRES_REVIEW", 403);

      const [[application], [identity]] = await Promise.all([
        tx
          .select({
            status: accessApplications.status,
            email: accessApplications.email,
            emailVerifiedAt: accessApplications.emailVerifiedAt,
            reviewedAt: accessApplications.reviewedAt,
            reviewedById: accessApplications.reviewedById,
          })
          .from(accessApplications)
          .where(eq(accessApplications.id, access.applicationId))
          .limit(1),
        tx
          .select({ email: user.email, emailVerified: user.emailVerified })
          .from(user)
          .where(eq(user.id, targetUserId))
          .limit(1),
      ]);
      if (
        application?.status !== "approved" ||
        !application.emailVerifiedAt ||
        !application.reviewedAt ||
        !application.reviewedById ||
        !identity?.emailVerified ||
        application.email.trim().toLowerCase() !==
          identity.email.trim().toLowerCase()
      )
        return invalid("TARGET_NOT_APPROVED");

      // Optimistic concurrency check inside the SAME target row lock.
      // Reject a stale admin form instead of silently overwriting a newer action.
      const [latestAudit] = await tx
        .select({ id: accessLifecycleAudit.id })
        .from(accessLifecycleAudit)
        .where(
          and(
            eq(accessLifecycleAudit.targetUserId, targetUserId),
            eq(accessLifecycleAudit.organizationId, organization.id),
          ),
        )
        .orderBy(
          desc(accessLifecycleAudit.createdAt),
          desc(accessLifecycleAudit.id),
        )
        .limit(1);
      if ((latestAudit?.id ?? null) !== input.expectedLifecycleAuditId) {
        return invalid("STALE_LIFECYCLE_STATE", 409);
      }

      const active = await tx
        .select({ id: roleGrants.id, role: roleGrants.role })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, targetUserId),
            eq(roleGrants.organizationId, organization.id),
            isNull(roleGrants.revokedAt),
          ),
        )
        .limit(2);
      const plan = planLifecycleTransition({
        action,
        requestedRole: input.role,
        accessStatus: access.status,
        activeRoles: active.map((grant) => grant.role),
      });
      if (!plan.ok) return invalid(plan.code);

      const now = new Date();
      if (plan.revokeExisting) {
        await tx
          .update(roleGrants)
          .set({ revokedAt: now, revokedById: admin.userId })
          .where(
            and(
              eq(roleGrants.userId, targetUserId),
              eq(roleGrants.organizationId, organization.id),
              isNull(roleGrants.revokedAt),
            ),
          );
      }
      if (plan.nextRole) {
        await tx.insert(roleGrants).values({
          userId: targetUserId,
          organizationId: organization.id,
          role: plan.nextRole,
          grantedById: admin.userId,
        });
      }
      if (plan.disableAccount) {
        await tx
          .update(userAccess)
          .set({ status: "disabled", disabledAt: now, updatedAt: now })
          .where(eq(userAccess.userId, targetUserId));
      }

      // Deletes Better Auth DB sessions and cascades MFA session assurance.
      // A stale browser cookie cannot authorize subsequent protected requests.
      await tx.delete(session).where(eq(session.userId, targetUserId));

      await tx.insert(accessLifecycleAudit).values({
        organizationId: organization.id,
        actorUserId: admin.userId,
        targetUserId,
        action: plan.auditAction,
        previousRole: active.length === 1 ? active[0].role : null,
        newRole: plan.nextRole,
        previousStatus: access.status,
        newStatus: plan.disableAccount ? "disabled" : access.status,
        reason,
      });
      return { ok: true, outcome: plan.auditAction };
    });
  } catch {
    console.error("Access lifecycle transaction failed");
    return jsonError("LIFECYCLE_UNAVAILABLE", 503);
  }
  if (!outcome.ok) return jsonError(outcome.code, outcome.status);
  return Response.json({ outcome: outcome.outcome }, { headers: NO_STORE });
}
