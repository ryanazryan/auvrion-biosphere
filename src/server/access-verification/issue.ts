import { and, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";
import { accessEmailVerificationTokens } from "@/server/db/access-verification-schema";
import { sendAccessVerificationEmail } from "./mailer";
import {
  createVerificationToken,
  EMAIL_VERIFICATION_RESEND_SECONDS,
} from "./token";

/**
 * Issue one valid verification link for an existing submitted application.
 * Reuse for automatic submission mail and the explicit resend endpoint.
 * A transaction guards issuance against concurrent resend requests.
 */
export async function issueVerificationEmail(email: string): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const threshold = new Date(
    now.getTime() - EMAIL_VERIFICATION_RESEND_SECONDS * 1000,
  );
  const verification = createVerificationToken();
  let recipient: string | null = null;

  await db.transaction(async (tx) => {
    const [application] = await tx
      .select({
        id: accessApplications.id,
        email: accessApplications.email,
        status: accessApplications.status,
        emailVerifiedAt: accessApplications.emailVerifiedAt,
      })
      .from(accessApplications)
      .where(eq(accessApplications.email, email))
      .orderBy(accessApplications.createdAt)
      .limit(1)
      .for("update");

    if (
      application?.status !== "submitted" ||
      application.emailVerifiedAt !== null
    ) {
      return;
    }

    const [issued] = await tx
      .insert(accessEmailVerificationTokens)
      .values({
        applicationId: application.id,
        tokenHash: verification.tokenHash,
        expiresAt: verification.expiresAt,
        lastSentAt: now,
        usedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: accessEmailVerificationTokens.applicationId,
        set: {
          tokenHash: verification.tokenHash,
          expiresAt: verification.expiresAt,
          lastSentAt: now,
          usedAt: null,
          updatedAt: now,
        },
        setWhere: and(
          lte(accessEmailVerificationTokens.lastSentAt, threshold),
          isNull(accessEmailVerificationTokens.usedAt),
        ),
      })
      .returning({ id: accessEmailVerificationTokens.id });
    if (issued) recipient = application.email;
  });

  if (recipient === null) return false;
  await sendAccessVerificationEmail({
    to: recipient,
    token: verification.token,
  });
  return true;
}
