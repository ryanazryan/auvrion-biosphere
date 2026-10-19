import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { dispatchDecisionNotification } from "@/server/access-decision-notifications/dispatch";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { accessDecisionAudit } from "@/server/db/access-decision-audit-schema";
import { accessDecisionNotifications } from "@/server/db/access-decision-notification-schema";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import {
  adminCapabilityGrants,
  organizations,
} from "@/server/db/grants-schema";

type Decision = "approved" | "rejected";
type Context = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const responseHeaders = { "Cache-Control": "no-store" };

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: responseHeaders },
  );
}

export async function POST(request: NextRequest, context: Context) {
  // This workflow is intentionally scoped to local V1 development.
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES" ||
    !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)
  ) {
    return errorResponse("NOT_FOUND", 404);
  }

  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return errorResponse("INVALID_ORIGIN", 403);
  }

  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  ) {
    return errorResponse("UNSUPPORTED_CONTENT_TYPE", 415);
  }

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return errorResponse("INVALID_APPLICATION_ID", 400);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isSafeInteger(contentLength) || contentLength > 2048) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return errorResponse("INVALID_JSON", 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 2048) {
          await reader.cancel().catch(() => undefined);
          return errorResponse("INVALID_REQUEST", 400);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return errorResponse("INVALID_JSON", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const payload = body as Record<string, unknown>;
  const decision: Decision | null =
    payload.decision === "approved" || payload.decision === "rejected"
      ? payload.decision
      : null;

  if (!decision || typeof payload.reason !== "string") {
    return errorResponse("INVALID_DECISION", 400);
  }

  const reason = payload.reason.trim();
  if (reason.length > 500) return errorResponse("REASON_TOO_LONG", 400);
  if (decision === "rejected" && reason.length < 5) {
    return errorResponse("REJECTION_REASON_REQUIRED", 400);
  }

  const db = getDb();
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);

  if (!organization) return errorResponse("ORG_NOT_CONFIGURED", 503);

  const access = await checkAdminAccess(organization.id, "manage_access");
  if (!access.allowed) {
    return errorResponse(access.reason, access.status);
  }

  let notificationId: string;

  try {
    const result = await db.transaction(async (tx) => {
      const [currentAccount] = await tx
        .select({ status: userAccess.status })
        .from(userAccess)
        .where(eq(userAccess.userId, access.userId))
        .limit(1);

      const [grant] = await tx
        .select({ id: adminCapabilityGrants.id })
        .from(adminCapabilityGrants)
        .where(
          and(
            eq(adminCapabilityGrants.userId, access.userId),
            eq(adminCapabilityGrants.organizationId, organization.id),
            eq(adminCapabilityGrants.capability, "manage_access"),
            isNull(adminCapabilityGrants.revokedAt),
          ),
        )
        .limit(1);

      if (currentAccount?.status !== "active" || !grant) {
        return { kind: "denied" as const };
      }

      // Only verified applications can receive a decision. Conditional update
      // prevents a second decision and therefore duplicate notifications.
      const [updated] = await tx
        .update(accessApplications)
        .set({
          status: decision,
          reviewedById: access.userId,
          reviewedAt: new Date(),
          decisionReason: reason || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accessApplications.id, id),
            eq(accessApplications.status, "email_verified"),
            isNotNull(accessApplications.emailVerifiedAt),
          ),
        )
        .returning({
          id: accessApplications.id,
          applicantName: accessApplications.applicantName,
          email: accessApplications.email,
        });

      if (!updated) return { kind: "conflict" as const };

      // Audit and outbox event share the SAME transaction as the decision.
      await tx.insert(accessDecisionAudit).values({
        applicationId: updated.id,
        organizationId: organization.id,
        actorUserId: access.userId,
        previousStatus: "email_verified",
        newStatus: decision,
        reason: reason || null,
      });

      const [notification] = await tx
        .insert(accessDecisionNotifications)
        .values({
          applicationId: updated.id,
          organizationId: organization.id,
          kind: decision,
          recipientEmail: updated.email,
          recipientName: updated.applicantName,
          status: "pending",
        })
        .returning({ id: accessDecisionNotifications.id });

      if (!notification) throw new Error("OUTBOX_INSERT_FAILED");

      return { kind: "ok" as const, notificationId: notification.id };
    });

    if (result.kind === "denied") {
      return errorResponse("ACCESS_REVOKED", 403);
    }
    if (result.kind === "conflict") {
      return errorResponse("APPLICATION_NOT_REVIEWABLE", 409);
    }

    notificationId = result.notificationId;
  } catch {
    console.error("Access decision transaction failed");
    return errorResponse("DECISION_FAILED", 500);
  }

  // DB transaction is already COMMITTED. SMTP failure must not roll it back.
  let notification: "sent" | "pending" = "pending";
  try {
    const attempt = await dispatchDecisionNotification(notificationId);
    if (attempt === "sent") notification = "sent";
  } catch {
    // The committed outbox record is retryable via the admin dispatch endpoint.
    console.error("Access decision notification dispatch deferred");
  }

  return NextResponse.json(
    {
      status: decision,
      notification,
      message:
        decision === "approved"
          ? "Permohonan disetujui. Akun belum aktif; menunggu provisioning dan MFA."
          : "Permohonan ditolak.",
    },
    { headers: responseHeaders },
  );
}
