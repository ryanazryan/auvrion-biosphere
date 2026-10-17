import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { adminCapabilityGrants, roleGrants } from "@/server/db/grants-schema";

/**
 * Permission to BEGIN TOTP enrollment only. Never use as permission to access
 * operational data, admin actions, or to change user_access to active.
 * Caller must supply identity from a verified server-side Better Auth session.
 */
export async function isTotpEnrollmentEligible(identity: {
  id: string;
  email: string;
  emailVerified: boolean;
}): Promise<boolean> {
  if (!identity.emailVerified) return false;

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
    .where(eq(userAccess.userId, identity.id))
    .limit(1);

  if (
    !access ||
    (access.status !== "pending_activation" && access.status !== "active") ||
    access.applicationStatus !== "approved" ||
    !access.emailVerifiedAt ||
    !access.reviewedAt ||
    !access.reviewedById ||
    access.applicationEmail.trim().toLowerCase() !==
      identity.email.trim().toLowerCase()
  ) {
    return false;
  }

  // V1 requires explicit, unrevoked organization-scoped permission assignment
  // before a user is allowed to enroll. Having grants is NOT authorization here.
  const [[adminGrant], [operationalGrant]] = await Promise.all([
    db
      .select({ id: adminCapabilityGrants.id })
      .from(adminCapabilityGrants)
      .where(
        and(
          eq(adminCapabilityGrants.userId, identity.id),
          isNull(adminCapabilityGrants.revokedAt),
        ),
      )
      .limit(1),
    db
      .select({ id: roleGrants.id })
      .from(roleGrants)
      .where(
        and(eq(roleGrants.userId, identity.id), isNull(roleGrants.revokedAt)),
      )
      .limit(1),
  ]);

  return Boolean(adminGrant || operationalGrant);
}
