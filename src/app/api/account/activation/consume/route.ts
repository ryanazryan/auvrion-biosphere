import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  isLocalActivationRequest,
  jsonError,
  NO_STORE,
  readSmallJson,
} from "@/server/account-activation/http";
import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
import { isActivationPassword } from "@/server/account-activation/policy";
import { isProductionReviewerInvitation } from "@/server/account-activation/production-reviewer-policy";
import {
  hashActivationToken,
  isActivationToken,
} from "@/server/account-activation/token";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { accountActivationInvites } from "@/server/db/account-activation-schema";
import { account, user } from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!onboardingEnabled(process.env)) return jsonError("NOT_FOUND", 404);
  if (!isLocalActivationRequest(request))
    return jsonError("INVALID_ORIGIN", 403);
  let input: Record<string, unknown>;
  try {
    input = await readSmallJson(request);
  } catch {
    return jsonError("INVALID_REQUEST", 400);
  }
  if (!isActivationToken(input.token))
    return jsonError("INVALID_OR_EXPIRED_INVITATION", 400);
  if (!isActivationPassword(input.password))
    return jsonError("PASSWORD_POLICY_NOT_MET", 400);
  const now = new Date();
  const tokenHash = hashActivationToken(input.token);
  const db = getDb();
  // Cheap preflight before CPU-expensive scrypt. Rechecked under lock below.
  try {
    const [candidate] = await db
      .select({
        expiresAt: accountActivationInvites.expiresAt,
        usedAt: accountActivationInvites.usedAt,
      })
      .from(accountActivationInvites)
      .where(eq(accountActivationInvites.tokenHash, tokenHash))
      .limit(1);
    if (
      !candidate ||
      candidate.usedAt ||
      candidate.expiresAt.getTime() <= now.getTime()
    )
      return jsonError("INVALID_OR_EXPIRED_INVITATION", 400);
  } catch {
    return jsonError("ACTIVATION_UNAVAILABLE", 503);
  }

  let hashedPassword: string;
  try {
    hashedPassword = await hashPassword(input.password);
  } catch {
    return jsonError("ACTIVATION_UNAVAILABLE", 503);
  }
  try {
    const done = await db.transaction(async (tx) => {
      const [invite] = await tx
        .select({
          id: accountActivationInvites.id,
          applicationId: accountActivationInvites.applicationId,
          userId: accountActivationInvites.userId,
          expiresAt: accountActivationInvites.expiresAt,
          usedAt: accountActivationInvites.usedAt,
          issuedById: accountActivationInvites.issuedById,
        })
        .from(accountActivationInvites)
        .where(eq(accountActivationInvites.tokenHash, tokenHash))
        .limit(1)
        .for("update");
      if (
        !invite ||
        invite.usedAt ||
        invite.expiresAt.getTime() <= now.getTime()
      )
        return false;
      const [[application], [access], [identity], [organization]] =
        await Promise.all([
          tx
            .select({
              status: accessApplications.status,
              email: accessApplications.email,
              verifiedAt: accessApplications.emailVerifiedAt,
              reviewedAt: accessApplications.reviewedAt,
              reviewerId: accessApplications.reviewedById,
              decisionReason: accessApplications.decisionReason,
            })
            .from(accessApplications)
            .where(eq(accessApplications.id, invite.applicationId))
            .limit(1),
          tx
            .select({ userId: userAccess.userId, status: userAccess.status })
            .from(userAccess)
            .where(eq(userAccess.applicationId, invite.applicationId))
            .limit(1),
          tx
            .select({
              id: user.id,
              email: user.email,
              verified: user.emailVerified,
            })
            .from(user)
            .where(eq(user.id, invite.userId))
            .limit(1),
          tx
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.code, "AUVRION-LOCAL"))
            .limit(1),
        ]);
      if (
        application?.status !== "approved" ||
        !application.verifiedAt ||
        !application.reviewedAt ||
        !application.reviewerId ||
        !access ||
        access.userId !== invite.userId ||
        access.status !== "pending_activation" ||
        !identity ||
        !identity.verified ||
        identity.email.trim().toLowerCase() !==
          application.email.trim().toLowerCase() ||
        !organization
      )
        return false;
      const [[grant], [credential]] = await Promise.all([
        tx
          .select({ id: roleGrants.id })
          .from(roleGrants)
          .where(
            and(
              eq(roleGrants.userId, invite.userId),
              eq(roleGrants.organizationId, organization.id),
              isNull(roleGrants.revokedAt),
            ),
          )
          .limit(1),
        tx
          .select({ id: account.id })
          .from(account)
          .where(
            and(
              eq(account.userId, invite.userId),
              eq(account.providerId, "credential"),
            ),
          )
          .limit(1),
      ]);
      let authorizedReviewer = false;
      if (!grant) {
        const [[inviter], reviewerGrants] = await Promise.all([
          tx
            .select({ email: user.email })
            .from(user)
            .where(eq(user.id, invite.issuedById))
            .limit(1),
          tx
            .select({ capability: adminCapabilityGrants.capability })
            .from(adminCapabilityGrants)
            .where(
              and(
                eq(adminCapabilityGrants.userId, invite.userId),
                eq(adminCapabilityGrants.organizationId, organization.id),
                isNull(adminCapabilityGrants.revokedAt),
              ),
            ),
        ]);
        const privileges = new Set(reviewerGrants.map((g) => g.capability));
        authorizedReviewer = isProductionReviewerInvitation({
          environment: process.env.NODE_ENV,
          configuredOwnerEmail: process.env.PRODUCTION_ADMIN_EMAIL,
          inviterEmail: inviter?.email,
          issuerId: invite.issuedById,
          reviewerId: application.reviewerId,
          decisionReason: application.decisionReason,
          hasReviewApplications: privileges.has("review_applications"),
          hasManageAccess: privileges.has("manage_access"),
        });
      }
      if ((!grant && !authorizedReviewer) || credential) return false;
      // Mirror scripts/dev/bootstrap-admin.mjs credential format for Better Auth.
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: invite.userId,
        providerId: "credential",
        userId: invite.userId,
        password: hashedPassword,
        updatedAt: now,
      });
      const [consumed] = await tx
        .update(accountActivationInvites)
        .set({ usedAt: now, updatedAt: now })
        .where(
          and(
            eq(accountActivationInvites.id, invite.id),
            isNull(accountActivationInvites.usedAt),
          ),
        )
        .returning({ id: accountActivationInvites.id });
      if (!consumed) throw new Error("TOKEN_CONCURRENT_REUSE");
      return true;
    });
    if (!done) return jsonError("INVALID_OR_EXPIRED_INVITATION", 400);
    // No automatic login, no active account: TOTP remains mandatory.
    return Response.json(
      { outcome: "PASSWORD_SET_MFA_REQUIRED" },
      { headers: NO_STORE },
    );
  } catch {
    console.error("Account activation consumption failed");
    return jsonError("ACTIVATION_UNAVAILABLE", 503);
  }
}
