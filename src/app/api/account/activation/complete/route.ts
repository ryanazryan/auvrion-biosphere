import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import {
  isVerifiedLocalBootstrapAdmin,
  isVerifiedProductionBootstrapAdmin,
} from "@/server/account-activation/bootstrap-admin-policy";
import {
  isLocalActivationRequest,
  jsonError,
  NO_STORE,
} from "@/server/account-activation/http";
import { onboardingEnabled } from "@/server/account-activation/onboarding-environment";
import { isProductionReviewerInvitation } from "@/server/account-activation/production-reviewer-policy";
import { getCurrentSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { accountActivationInvites } from "@/server/db/account-activation-schema";
import {
  account,
  session as authSessions,
  twoFactor,
  user,
} from "@/server/db/auth-schema";
import {
  adminCapabilityGrants,
  organizations,
  roleGrants,
} from "@/server/db/grants-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Explicitly enable onboarding for the current environment.
  // Production remains disabled unless explicitly configured.
  if (!onboardingEnabled(process.env)) {
    return jsonError("NOT_FOUND", 404);
  }

  // Verify that the request originates from the configured application.
  if (!isLocalActivationRequest(request)) {
    return jsonError("INVALID_ORIGIN", 403);
  }

  // Require a valid Better Auth session.
  const current = await getCurrentSession();

  if (!current) {
    return jsonError("UNAUTHENTICATED", 401);
  }

  if (!current.user.emailVerified) {
    return jsonError("EMAIL_NOT_VERIFIED", 403);
  }

  try {
    const outcome = await getDb().transaction(async (tx) => {
      // Lock account access to prevent concurrent activation.
      const [access] = await tx
        .select({
          userId: userAccess.userId,
          applicationId: userAccess.applicationId,
          status: userAccess.status,
        })
        .from(userAccess)
        .where(eq(userAccess.userId, current.user.id))
        .limit(1)
        .for("update");

      if (!access) {
        return "DENIED" as const;
      }

      if (access.status === "active") {
        return "ALREADY_ACTIVE" as const;
      }

      if (access.status !== "pending_activation") {
        return "DENIED" as const;
      }

      // Load the identity, application, MFA, credential,
      // invitation, and organization requirements.
      const [[app], [identity], [invite], [factor], [credential], [org]] =
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
            .where(eq(accessApplications.id, access.applicationId))
            .limit(1),

          tx
            .select({
              email: user.email,
              verified: user.emailVerified,
              totpEnabled: user.twoFactorEnabled,
            })
            .from(user)
            .where(eq(user.id, current.user.id))
            .limit(1),

          tx
            .select({
              userId: accountActivationInvites.userId,
              usedAt: accountActivationInvites.usedAt,
              issuedById: accountActivationInvites.issuedById,
            })
            .from(accountActivationInvites)
            .where(
              eq(accountActivationInvites.applicationId, access.applicationId),
            )
            .limit(1),

          tx
            .select({ id: twoFactor.id })
            .from(twoFactor)
            .where(
              and(
                eq(twoFactor.userId, current.user.id),
                eq(twoFactor.verified, true),
              ),
            )
            .limit(1),

          tx
            .select({ id: account.id })
            .from(account)
            .where(
              and(
                eq(account.userId, current.user.id),
                eq(account.providerId, "credential"),
              ),
            )
            .limit(1),

          tx
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.code, "AUVRION-LOCAL"))
            .limit(1),
        ]);

      // All baseline activation requirements must be satisfied.
      if (
        app?.status !== "approved" ||
        !app.verifiedAt ||
        !app.reviewedAt ||
        !app.reviewerId ||
        !identity ||
        !identity.verified ||
        !identity.totpEnabled ||
        identity.email.trim().toLowerCase() !==
          app.email.trim().toLowerCase() ||
        identity.email.trim().toLowerCase() !==
          current.user.email.trim().toLowerCase() ||
        !factor ||
        !credential ||
        !org
      ) {
        return "DENIED" as const;
      }

      // Ordinary users must have a consumed invitation
      // and an active organization-scoped operational role.
      const [grant] = await tx
        .select({ id: roleGrants.id })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, current.user.id),
            eq(roleGrants.organizationId, org.id),
            isNull(roleGrants.revokedAt),
          ),
        )
        .limit(1);

      let invitedReviewer = false;
      if (
        invite &&
        invite.userId === current.user.id &&
        invite.usedAt &&
        !grant
      ) {
        const [[inviter], adminGrants] = await Promise.all([
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
                eq(adminCapabilityGrants.userId, current.user.id),
                eq(adminCapabilityGrants.organizationId, org.id),
                isNull(adminCapabilityGrants.revokedAt),
              ),
            ),
        ]);
        const privileges = new Set(adminGrants.map((g) => g.capability));
        invitedReviewer = isProductionReviewerInvitation({
          environment: process.env.NODE_ENV,
          configuredOwnerEmail: process.env.PRODUCTION_ADMIN_EMAIL,
          inviterEmail: inviter?.email,
          issuerId: invite.issuedById,
          reviewerId: app.reviewerId,
          decisionReason: app.decisionReason,
          hasReviewApplications: privileges.has("review_applications"),
          hasManageAccess: privileges.has("manage_access"),
        });
      }
      const ordinaryActivation =
        !!invite &&
        invite.userId === current.user.id &&
        !!invite.usedAt &&
        (!!grant || invitedReviewer);

      // Existing local-development bootstrap exception.
      // This is NOT yet a production bootstrap authorization.
      let bootstrapActivation = false;

      if (!ordinaryActivation && !invite) {
        const grants = await tx
          .select({
            capability: adminCapabilityGrants.capability,
          })
          .from(adminCapabilityGrants)
          .where(
            and(
              eq(adminCapabilityGrants.userId, current.user.id),
              eq(adminCapabilityGrants.organizationId, org.id),
              isNull(adminCapabilityGrants.revokedAt),
            ),
          );

        const capabilities = new Set(grants.map((grant) => grant.capability));

        const bootstrapIdentity = {
          userId: current.user.id,
          email: identity.email,
          applicationEmail: app.email,
          reviewerId: app.reviewerId,
          decisionReason: app.decisionReason,
          hasReviewApplications: capabilities.has("review_applications"),
          hasManageAccess: capabilities.has("manage_access"),
        };

        bootstrapActivation =
          (process.env.NODE_ENV === "development" &&
            isVerifiedLocalBootstrapAdmin(bootstrapIdentity)) ||
          isVerifiedProductionBootstrapAdmin({
            ...bootstrapIdentity,
            environment: process.env.NODE_ENV,
            configuredOwnerEmail: process.env.PRODUCTION_ADMIN_EMAIL,
          });
      }

      // Never activate an account without its expected
      // onboarding provenance.
      if (!ordinaryActivation && !bootstrapActivation) {
        return "DENIED" as const;
      }

      const now = new Date();

      // Activate only an account that is still pending.
      const [updated] = await tx
        .update(userAccess)
        .set({
          status: "active",
          activatedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(userAccess.userId, current.user.id),
            eq(userAccess.status, "pending_activation"),
          ),
        )
        .returning({
          userId: userAccess.userId,
        });

      if (!updated) {
        return "DENIED" as const;
      }

      // Revoke all existing sessions after activation.
      // A new password + TOTP login is required.
      await tx
        .delete(authSessions)
        .where(eq(authSessions.userId, current.user.id));

      return "ACTIVATED" as const;
    });

    if (outcome === "DENIED") {
      return jsonError("ACTIVATION_REQUIREMENTS_NOT_MET", 403);
    }

    return Response.json({ outcome }, { headers: NO_STORE });
  } catch {
    console.error("Activation completion failed");

    return jsonError("ACTIVATION_UNAVAILABLE", 503);
  }
}
