import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";

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

  // The enrollment gate must use the same organization boundary as activation.
  // A grant from another organization does not authorize enrollment in V1.
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);
  if (!organization) return false;

  // V1 requires explicit unrevoked organization-scoped assignment.
  // Enrollment eligibility is NOT operational/admin authorization.
  const [[adminGrant], [operationalGrant]] = await Promise.all([
    db
      .select({ id: adminCapabilityGrants.id })
      .from(adminCapabilityGrants)
      .where(
        and(
          eq(adminCapabilityGrants.userId, identity.id),
          eq(adminCapabilityGrants.organizationId, organization.id),
          isNull(adminCapabilityGrants.revokedAt),
        ),
      )
      .limit(1),
    db
      .select({ id: roleGrants.id })
      .from(roleGrants)
      .where(
        and(
          eq(roleGrants.userId, identity.id),
          eq(roleGrants.organizationId, organization.id),
          isNull(roleGrants.revokedAt),
        ),
      )
      .limit(1),
  ]);

  return Boolean(adminGrant || operationalGrant);
}
