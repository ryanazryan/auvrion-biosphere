import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { accessDecisionAudit } from "@/server/db/access-decision-audit-schema";
import { accessApplications, userAccess } from "@/server/db/access-schema";
import {
  adminCapabilityGrants,
  organizations,
} from "@/server/db/grants-schema";

type Decision = "approved" | "rejected";

type Context = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest, context: Context) {
  // access_applications belum memiliki organizationId.
  // Endpoint keputusan ini dibatasi untuk development lokal.
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    return errorResponse("NOT_FOUND", 404);
  }

  // Tolak cross-origin state-changing requests.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return errorResponse("INVALID_ORIGIN", 403);
  }

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return errorResponse("UNSUPPORTED_CONTENT_TYPE", 415);
  }

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return errorResponse("INVALID_APPLICATION_ID", 400);
  }

  let body: unknown;

  try {
    body = await request.json();
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

  if (reason.length > 500) {
    return errorResponse("REASON_TOO_LONG", 400);
  }

  if (decision === "rejected" && reason.length < 5) {
    return errorResponse("REJECTION_REASON_REQUIRED", 400);
  }

  const db = getDb();

  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);

  if (!organization) {
    return errorResponse("ORG_NOT_CONFIGURED", 503);
  }

  // Wajib: account active, capability manage_access,
  // dan bukti MFA untuk sesi saat ini.
  const access = await checkAdminAccess(organization.id, "manage_access");

  if (!access.allowed) {
    return errorResponse(access.reason, access.status);
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Pemeriksaan tambahan sebelum penulisan.
      const [currentAccount] = await tx
        .select({
          status: userAccess.status,
        })
        .from(userAccess)
        .where(eq(userAccess.userId, access.userId))
        .limit(1);

      const [grant] = await tx
        .select({
          id: adminCapabilityGrants.id,
        })
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
        return "denied" as const;
      }

      // Hanya email_verified yang dapat diputuskan.
      // Conditional UPDATE mencegah keputusan ganda.
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
        });

      if (!updated) {
        return "conflict" as const;
      }

      // Audit ditulis dalam transaksi yang sama.
      await tx.insert(accessDecisionAudit).values({
        applicationId: updated.id,
        organizationId: organization.id,
        actorUserId: access.userId,
        previousStatus: "email_verified",
        newStatus: decision,
        reason: reason || null,
      });

      return "ok" as const;
    });

    if (result === "denied") {
      return errorResponse("ACCESS_REVOKED", 403);
    }

    if (result === "conflict") {
      return errorResponse("APPLICATION_NOT_REVIEWABLE", 409);
    }

    return NextResponse.json({
      status: decision,
      message:
        decision === "approved"
          ? "Permohonan disetujui. Akun belum aktif; menunggu provisioning dan MFA."
          : "Permohonan ditolak.",
    });
  } catch {
    console.error("Access decision transaction failed");

    return errorResponse("DECISION_FAILED", 500);
  }
}
