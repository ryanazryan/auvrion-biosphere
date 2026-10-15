import "server-only";

import { eq } from "drizzle-orm";

import { getCurrentSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";

export type AccountAccessResult =
  | {
      allowed: false;
      status: 401 | 403;
      reason: string;
    }
  | {
      allowed: true;
      userId: string;
    };

export async function checkAccountAccess(): Promise<AccountAccessResult> {
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

  const sameEmail =
    access.applicationEmail.trim().toLowerCase() ===
    session.user.email.trim().toLowerCase();

  const isAuthorized =
    access.status === "active" &&
    access.applicationStatus === "approved" &&
    access.emailVerifiedAt !== null &&
    access.reviewedAt !== null &&
    access.reviewedById !== null &&
    sameEmail;

  if (!isAuthorized) {
    return {
      allowed: false,
      status: 403,
      reason: "ACCOUNT_NOT_AUTHORIZED",
    };
  }

  return {
    allowed: true,
    userId: session.user.id,
  };
}
