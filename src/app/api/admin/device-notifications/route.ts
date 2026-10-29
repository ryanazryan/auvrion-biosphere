import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import { accessApplications } from "@/server/db/access-schema";
import {
  adminCapabilityGrants,
  organizations,
} from "@/server/db/grants-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = {
    "Cache-Control": "no-store",
    Vary: "Cookie",
  };

  const session = await getCurrentSession();

  if (!session) {
    return Response.json(
      { error: "NOT_AUTHENTICATED" },
      { status: 401, headers },
    );
  }

  // The V1 access_applications table is not organization-scoped.
  // Counting all applications is only valid in the single-org local environment.
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  ) {
    return Response.json(
      { error: "NOTIFICATION_SCOPE_UNAVAILABLE" },
      { status: 403, headers },
    );
  }

  const db = getDb();

  const [organization] = await db
    .select({
      id: organizations.id,
    })
    .from(organizations)
    .where(eq(organizations.code, "AUVRION-LOCAL"))
    .limit(1);

  if (!organization) {
    return Response.json(
      { error: "ORGANIZATION_NOT_FOUND" },
      { status: 404, headers },
    );
  }

  const [grant] = await db
    .select({ id: adminCapabilityGrants.id })
    .from(adminCapabilityGrants)
    .where(
      and(
        eq(adminCapabilityGrants.userId, session.user.id),
        eq(adminCapabilityGrants.organizationId, organization.id),
        eq(adminCapabilityGrants.capability, "review_applications"),
        isNull(adminCapabilityGrants.revokedAt),
      ),
    )
    .limit(1);

  if (!grant) {
    return Response.json(
      { error: "REVIEW_ACCESS_REQUIRED" },
      { status: 403, headers },
    );
  }

  const allowed = await checkAdminAccess(
    organization.id,
    "review_applications",
  );

  if (!allowed.allowed) {
    return Response.json(
      { error: allowed.reason },
      { status: allowed.status, headers },
    );
  }

  const [result] = await db
    .select({
      total: sql<number>`count(*)::integer`,
    })
    .from(accessApplications)
    .where(
      sql`${accessApplications.status} IN ('submitted', 'email_verified')`,
    );

  return Response.json({ pending: result?.total ?? 0 }, { headers });
}
