import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getCurrentSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { roleGrants } from "@/server/db/grants-schema";

type OperationalRole = typeof roleGrants.$inferSelect.role;

type AccessResult =
  | {
      allowed: false;
      status: 401 | 403;
      reason: string;
    }
  | {
      allowed: true;
      userId: string;
      organizationId: string;
      role: OperationalRole;
    };

export async function checkOperationalAccess(
  organizationId: string,
  requiredRole: OperationalRole,
): Promise<AccessResult> {
  const session = await getCurrentSession();

  if (!session) {
    return {
      allowed: false,
      status: 401,
      reason: "UNAUTHENTICATED",
    };
  }

  if (!session.user.emailVerified) {
    return {
      allowed: false,
      status: 403,
      reason: "EMAIL_NOT_VERIFIED",
    };
  }

  const db = getDb();

  const [access] = await db
    .select({
      status: userAccess.status,
      applicationStatus: accessApplications.status,
      applicationEmail: accessApplications.email,
      emailVerifiedAt: accessApplications.emailVerifiedAt,
      reviewedAt: accessApplications.reviewedAt,
      reviewedById: accessApplications.reviewedById,
    })
    .from(userAccess)
    .innerJoin(
      accessApplications,
      eq(userAccess.applicationId, accessApplications.id),
    )
    .where(eq(userAccess.userId, session.user.id))
    .limit(1);

  if (!access) {
    return {
      allowed: false,
      status: 403,
      reason: "ACCOUNT_NOT_AUTHORIZED",
    };
  }

  if (
    access.status !== "active" ||
    access.applicationStatus !== "approved" ||
    !access.emailVerifiedAt ||
    !access.reviewedAt ||
    !access.reviewedById ||
    access.applicationEmail.trim().toLowerCase() !==
      session.user.email.trim().toLowerCase()
  ) {
    return {
      allowed: false,
      status: 403,
      reason: "ACCOUNT_NOT_AUTHORIZED",
    };
  }

  const [grant] = await db
    .select({ id: roleGrants.id })
    .from(roleGrants)
    .where(
      and(
        eq(roleGrants.userId, session.user.id),
        eq(roleGrants.organizationId, organizationId),
        eq(roleGrants.role, requiredRole),
        isNull(roleGrants.revokedAt),
      ),
    )
    .limit(1);

  if (!grant) {
    return {
      allowed: false,
      status: 403,
      reason: "ROLE_OR_SCOPE_DENIED",
    };
  }

  // Fail closed until the approved MFA assurance mechanism
  // is integrated and verified server-side.
  return {
    allowed: false,
    status: 403,
    reason: "MFA_ASSURANCE_REQUIRED",
  };
}
