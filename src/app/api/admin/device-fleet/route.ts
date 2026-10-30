import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getCurrentSession } from "@/server/auth/session";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { getDb } from "@/server/db";
import {
  adminCapabilityGrants,
  organizations,
} from "@/server/db/grants-schema";
import { reply } from "@/server/device-ingestion/device-admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only, scoped device/source inventory. No credentials or precise coordinates returned. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return reply({ error: "UNAUTHENTICATED" }, 401);

  const db = getDb();
  const grants = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(adminCapabilityGrants)
    .innerJoin(
      organizations,
      eq(adminCapabilityGrants.organizationId, organizations.id),
    )
    .where(
      and(
        eq(adminCapabilityGrants.userId, session.user.id),
        eq(adminCapabilityGrants.capability, "manage_devices"),
        isNull(adminCapabilityGrants.revokedAt),
      ),
    )
    .orderBy(asc(organizations.name))
    .limit(20);

  for (const org of grants) {
    const authorized = await checkAdminAccess(org.id, "manage_devices");
    if (!authorized.allowed) continue;
    try {
      const result = await db.execute(sql`
        SELECT
          s.id::text AS "sourceId", s.kind::text AS "kind",
          s.code AS "code", s.label AS "label", s.is_active AS "sourceActive",
          d.id::text AS "deviceId", d.status AS "deviceStatus",
          d.credential_version AS "credentialVersion",
          l.location_label AS "locationLabel",
          l.disclosure_approved AS "locationDisclosureApproved",
          (SELECT COUNT(*)::integer FROM ingestion_recordings r
             WHERE r.device_id = d.id AND r.organization_id = ${org.id}::uuid
          ) AS "recordingCount",
          (SELECT MAX(r.created_at) FROM ingestion_recordings r
             WHERE r.device_id = d.id AND r.organization_id = ${org.id}::uuid
          ) AS "lastRecordingAt"
        FROM observation_sources s
        LEFT JOIN ingestion_devices d
          ON d.source_id = s.id AND d.organization_id = s.organization_id
        LEFT JOIN listen_device_installations l
          ON l.device_id = d.id AND l.organization_id = s.organization_id
        WHERE s.organization_id = ${org.id}::uuid
          AND s.kind IN ('listen_device', 'prevent_device')
        ORDER BY s.kind, s.code
        LIMIT 200
      `);
      return reply({
        organizationId: org.id,
        organizationName: org.name,
        devices: result.rows,
      });
    } catch {
      return reply({ error: "DEVICE_INVENTORY_UNAVAILABLE" }, 503);
    }
  }
  return reply({ error: "ADMIN_MFA_OR_DEVICE_CAPABILITY_REQUIRED" }, 403);
}
