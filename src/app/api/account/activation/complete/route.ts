import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { isVerifiedLocalBootstrapAdmin } from "@/server/account-activation/bootstrap-admin-policy";
import {
  isLocalActivationRequest,
  jsonError,
  NO_STORE,
} from "@/server/account-activation/http";
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
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  )
    return jsonError("NOT_FOUND", 404);
  if (!isLocalActivationRequest(request))
    return jsonError("INVALID_ORIGIN", 403);
  const current = await getCurrentSession();
  if (!current) return jsonError("UNAUTHENTICATED", 401);
  if (!current.user.emailVerified) return jsonError("EMAIL_NOT_VERIFIED", 403);
  try {
    const outcome = await getDb().transaction(async (tx) => {
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
      if (!access) return "DENIED" as const;
      if (access.status === "active") return "ALREADY_ACTIVE" as const;
      if (access.status !== "pending_activation") return "DENIED" as const;
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
      )
        return "DENIED" as const;
      // Ordinary users must consume a valid invite and hold an operational role.
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
      const ordinaryActivation =
        !!invite &&
        invite.userId === current.user.id &&
        !!invite.usedAt &&
        !!grant;

      // A first-admin bootstrap creates a credential and admin capability grants,
      // not an invitation or operational role. Verify its exact provenance.
      let bootstrapActivation = false;
      if (!ordinaryActivation && !invite) {
        const grants = await tx
          .select({ capability: adminCapabilityGrants.capability })
          .from(adminCapabilityGrants)
          .where(
            and(
              eq(adminCapabilityGrants.userId, current.user.id),
              eq(adminCapabilityGrants.organizationId, org.id),
              isNull(adminCapabilityGrants.revokedAt),
            ),
          );
        const capabilities = new Set(grants.map((grant) => grant.capability));
        bootstrapActivation = isVerifiedLocalBootstrapAdmin({
          userId: current.user.id,
          email: identity.email,
          applicationEmail: app.email,
          reviewerId: app.reviewerId,
          decisionReason: app.decisionReason,
          hasReviewApplications: capabilities.has("review_applications"),
          hasManageAccess: capabilities.has("manage_access"),
        });
      }
      if (!ordinaryActivation && !bootstrapActivation) return "DENIED" as const;
      const [updated] = await tx
        .update(userAccess)
        .set({
          status: "active",
          activatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userAccess.userId, current.user.id),
            eq(userAccess.status, "pending_activation"),
          ),
        )
        .returning({ userId: userAccess.userId });
      if (!updated) return "DENIED" as const;
      // Delete all pre-enrollment sessions before permitting operational access.
      // Fresh password + TOTP sign-in must mint a new assured session.
      await tx
        .delete(authSessions)
        .where(eq(authSessions.userId, current.user.id));
      return "ACTIVATED" as const;
    });
    if (outcome === "DENIED")
      return jsonError("ACTIVATION_REQUIREMENTS_NOT_MET", 403);
    return Response.json({ outcome }, { headers: NO_STORE });
  } catch {
    console.error("Activation completion failed");
    return jsonError("ACTIVATION_UNAVAILABLE", 503);
  }
}
