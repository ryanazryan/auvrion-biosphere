import type { MultiPolygonGeometry } from "@/types/geojson";
import "server-only";

import { Pool } from "pg";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { isTaskUuid } from "@/server/ranger/ranger-task-query";
import { getMyRangerTask } from "@/server/ranger/ranger-task-service";

export type TaskMapLocation = {
  zone: { code: string; name: string };
  point: { latitude: number; longitude: number; label: string } | null;
  geometry: MultiPolygonGeometry | null;
  locationType:
    | "listen_installation"
    | "environmental_observation"
    | "zone_only";
  verifiedAt: string | null;
  incidentConfirmed: false;
  disclosure: "approved" | "zone_only";
};

let pool: Pool | undefined;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

/** Scope before querying coordinates; never use a user-supplied Ranger identity. */
export async function getAuthorizedRangerTaskLocation(
  organizationId: string,
  taskId: string,
): Promise<{ status: number; data: TaskMapLocation | { error: string } }> {
  if (!isTaskUuid(organizationId) || !isTaskUuid(taskId)) {
    return { status: 400, data: { error: "INVALID_TASK_LOCATION_REQUEST" } };
  }
  const access = await checkOperationalAccess(organizationId, "ranger");
  if (!access.allowed) {
    return { status: access.status, data: { error: access.reason } };
  }
  const task = await getMyRangerTask(organizationId, access.userId, taskId);
  if (!task || task.status === "cancelled") {
    return { status: 404, data: { error: "TASK_NOT_FOUND" } };
  }
  try {
    // Snapshot is immutable across later device relocation or zone revisions.
    const { rows } = await getPool().query<{
      code: string;
      name: string;
      geometry: MultiPolygonGeometry | null;
      latitude: number | null;
      longitude: number | null;
      location_label: string | null;
      verified_at: Date | null;
    }>(
      `SELECT z.code, z.name,
              ST_AsGeoJSON(g.boundary)::json AS geometry,
              s.latitude, s.longitude, s.location_label, s.verified_at
         FROM ranger_task_location_snapshots s
         JOIN operational_zones z ON z.id=s.zone_id AND z.organization_id=s.organization_id
         LEFT JOIN zone_geometry_versions g ON g.id=s.geometry_version_id
                                   AND g.organization_id=s.organization_id
        WHERE s.task_id=$1 AND s.organization_id=$2 LIMIT 1`,
      [taskId, organizationId],
    );
    const row = rows[0];
    if (!row)
      return { status: 404, data: { error: "TASK_LOCATION_NOT_RECORDED" } };

    const listenDisclosure =
      process.env.AUVRION_RANGER_LISTEN_LOCATION === "YES";
    const envDisclosure =
      process.env.AUVRION_ENV_RISK_PRECISE_LOCATION === "YES";
    const hasDevicePoint = row.latitude !== null && row.longitude !== null;
    let point: TaskMapLocation["point"] =
      listenDisclosure && hasDevicePoint
        ? {
            latitude: row.latitude as number,
            longitude: row.longitude as number,
            label: row.location_label || "Instalasi LISTEN",
          }
        : null;
    let locationType: TaskMapLocation["locationType"] = point
      ? "listen_installation"
      : "zone_only";
    let verifiedAt =
      point && row.verified_at ? row.verified_at.toISOString() : null;

    // Only for environmental risk, and only if an organization-scoped active
    // Case observation is attached to this exact task.
    if (!point && envDisclosure) {
      const env = await getPool().query<{
        latitude: number;
        longitude: number;
      }>(
        `SELECT o.latitude, o.longitude
           FROM domain_tasks t
           JOIN case_observation_links col
             ON col.case_id=t.case_id AND col.organization_id=t.organization_id
           JOIN observations o ON o.id=col.observation_id
             AND o.organization_id=col.organization_id
          WHERE t.id=$1 AND t.organization_id=$2
            AND col.unlinked_at IS NULL AND o.domain='environmental_risk'
            AND o.latitude IS NOT NULL AND o.longitude IS NOT NULL
          ORDER BY o.received_at DESC LIMIT 1`,
        [taskId, organizationId],
      );
      if (env.rows[0]) {
        point = { ...env.rows[0], label: "Observasi risiko lingkungan" };
        locationType = "environmental_observation";
        verifiedAt = null;
      }
    }

    const approved = Boolean(point);
    return {
      status: 200,
      data: {
        zone: { code: row.code, name: row.name },
        point,
        geometry: approved ? row.geometry : null,
        locationType,
        verifiedAt,
        incidentConfirmed: false,
        disclosure: approved ? "approved" : "zone_only",
      },
    };
  } catch {
    return { status: 503, data: { error: "TASK_LOCATION_UNAVAILABLE" } };
  }
}
