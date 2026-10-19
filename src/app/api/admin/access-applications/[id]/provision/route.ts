import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  isLocalActivationRequest,
  jsonError,
  NO_STORE,
  readSmallJson,
} from "@/server/account-activation/http";
import { sendActivationInvitation } from "@/server/account-activation/mailer";
import {
  INVITATION_RESEND_COOLDOWN_SECONDS,
  isOperationalRole,
} from "@/server/account-activation/policy";
import { issueActivationToken } from "@/server/account-activation/token";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import { accountActivationInvites } from "@/server/db/account-activation-schema";
import { account, user } from "@/server/db/auth-schema";
import { organizations, roleGrants } from "@/server/db/grants-schema";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
type Result =
  | { ok: true; email: string; name: string; inviteId: string }
  | { ok: false; code: string; status: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const denied = (code: string, status = 409): Result => ({
  ok: false,
  code,
  status,
});

export async function POST(request: Request, context: Context) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  )
    return jsonError("NOT_FOUND", 404);
  if (!isLocalActivationRequest(request))
    return jsonError("INVALID_ORIGIN", 403);
  const { id } = await context.params;
  if (!uuid.test(id)) return jsonError("INVALID_APPLICATION_ID", 400);
  let input: Record<string, unknown>;
  try {
    input = await readSmallJson(request);
  } catch {
    return jsonError("INVALID_REQUEST", 400);
  }
  const action = input.action;
  if (action !== "issue" && action !== "resend")
    return jsonError("INVALID_ACTION", 400);
  if (action === "issue" && !isOperationalRole(input.role))
    return jsonError("INVALID_ROLE", 400);
  if (action === "resend" && input.role !== undefined)
    return jsonError("ROLE_CHANGE_NOT_ALLOWED", 400);

  const db = getDb();
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);
  if (!organization) return jsonError("ORG_NOT_CONFIGURED", 503);
  const admin = await checkAdminAccess(organization.id, "manage_access");
  if (!admin.allowed) return jsonError(admin.reason, admin.status);

  const now = new Date();
  const invitation = issueActivationToken(now);
  let result: Result;
  try {
    result = await db.transaction(async (tx): Promise<Result> => {
      // One application-level lock serializes admin issue/resend requests.
      const [application] = await tx
        .select({
          id: accessApplications.id,
          name: accessApplications.applicantName,
          email: accessApplications.email,
          status: accessApplications.status,
          emailVerifiedAt: accessApplications.emailVerifiedAt,
          reviewedAt: accessApplications.reviewedAt,
          reviewedById: accessApplications.reviewedById,
        })
        .from(accessApplications)
        .where(eq(accessApplications.id, id))
        .limit(1)
        .for("update");
      if (
        application?.status !== "approved" ||
        !application.emailVerifiedAt ||
        !application.reviewedAt ||
        !application.reviewedById
      )
        return denied("APPLICATION_NOT_APPROVED");
      const email = application.email.trim().toLowerCase();

      if (action === "issue") {
        const [existingAccess] = await tx
          .select({ userId: userAccess.userId })
          .from(userAccess)
          .where(eq(userAccess.applicationId, id))
          .limit(1);
        if (existingAccess) return denied("ALREADY_PROVISIONED");
        const [existingIdentity] = await tx
          .select({ id: user.id })
          .from(user)
          .where(sql`lower(${user.email}) = ${email}`)
          .limit(1);
        if (existingIdentity) return denied("IDENTITY_ALREADY_EXISTS");
        if (!isOperationalRole(input.role)) return denied("INVALID_ROLE", 400);
        const userId = randomUUID();
        // Email was verified during the existing application lifecycle;
        // no password/session is created by this transaction.
        await tx.insert(user).values({
          id: userId,
          name: application.name,
          email,
          emailVerified: true,
          twoFactorEnabled: false,
        });
        await tx.insert(userAccess).values({
          userId,
          applicationId: application.id,
          status: "pending_activation",
        });
        await tx.insert(roleGrants).values({
          userId,
          organizationId: organization.id,
          role: input.role,
          grantedById: admin.userId,
        });
        const [created] = await tx
          .insert(accountActivationInvites)
          .values({
            applicationId: application.id,
            userId,
            issuedById: admin.userId,
            tokenHash: invitation.tokenHash,
            expiresAt: invitation.expiresAt,
            issuedAt: now,
          })
          .returning({ id: accountActivationInvites.id });
        if (!created) throw new Error("INVITE_NOT_CREATED");
        return {
          ok: true,
          email,
          name: application.name,
          inviteId: created.id,
        };
      }

      const [access] = await tx
        .select({ userId: userAccess.userId, status: userAccess.status })
        .from(userAccess)
        .where(eq(userAccess.applicationId, id))
        .limit(1);
      if (access?.status !== "pending_activation")
        return denied("NOT_PENDING_ACTIVATION");
      const [old] = await tx
        .select({
          id: accountActivationInvites.id,
          userId: accountActivationInvites.userId,
          usedAt: accountActivationInvites.usedAt,
          issuedAt: accountActivationInvites.issuedAt,
        })
        .from(accountActivationInvites)
        .where(eq(accountActivationInvites.applicationId, id))
        .limit(1);
      if (!old || old.userId !== access.userId || old.usedAt)
        return denied("NOT_REISSUABLE");
      if (
        now.getTime() - old.issuedAt.getTime() <
        INVITATION_RESEND_COOLDOWN_SECONDS * 1000
      ) {
        return denied("INVITATION_COOLDOWN", 429);
      }
      const [existingCredential] = await tx
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, access.userId),
            eq(account.providerId, "credential"),
          ),
        )
        .limit(1);
      if (existingCredential) return denied("CREDENTIAL_ALREADY_SET");
      const [grant] = await tx
        .select({ id: roleGrants.id })
        .from(roleGrants)
        .where(
          and(
            eq(roleGrants.userId, access.userId),
            eq(roleGrants.organizationId, organization.id),
            isNull(roleGrants.revokedAt),
          ),
        )
        .limit(1);
      if (!grant) return denied("ROLE_GRANT_REQUIRED");
      // Compare-and-swap usedAt: concurrent activation must win over resend.
      const [rotated] = await tx
        .update(accountActivationInvites)
        .set({
          issuedById: admin.userId,
          tokenHash: invitation.tokenHash,
          expiresAt: invitation.expiresAt,
          issuedAt: now,
          sentAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(accountActivationInvites.id, old.id),
            isNull(accountActivationInvites.usedAt),
          ),
        )
        .returning({ id: accountActivationInvites.id });
      if (!rotated) return denied("INVITATION_ALREADY_CONSUMED");
      return { ok: true, email, name: application.name, inviteId: rotated.id };
    });
  } catch {
    console.error("Account provisioning transaction failed");
    return jsonError("PROVISIONING_UNAVAILABLE", 503);
  }
  if (!result.ok) return jsonError(result.code, result.status);
  let delivery: "sent" | "failed" = "sent";
  try {
    await sendActivationInvitation({
      email: result.email,
      name: result.name,
      token: invitation.token,
    });
    await db
      .update(accountActivationInvites)
      .set({ sentAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(accountActivationInvites.id, result.inviteId),
          eq(accountActivationInvites.tokenHash, invitation.tokenHash),
        ),
      );
  } catch {
    delivery = "failed";
    console.error("Activation invitation delivery failed");
  }
  return Response.json(
    {
      outcome: action === "issue" ? "PROVISIONED" : "INVITATION_ROTATED",
      delivery,
    },
    { status: action === "issue" ? 201 : 200, headers: NO_STORE },
  );
}
