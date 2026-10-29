import "server-only";
import { Pool } from "pg";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import {
  readBounded,
  reply,
  trustedOrigin,
  UUID,
} from "@/server/device-ingestion/device-admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let pool: Pool | undefined;
function db(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_NOT_CONFIGURED");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
    });
  }

  return pool;
}

/** A human-admin verified installation point, NEVER a wildlife detection. */
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return reply({ error: "INVALID_ORIGIN" }, 403);
  const body = await readBounded(request);
  if (
    !body ||
    Object.keys(body).some(
      (k) =>
        ![
          "organizationId",
          "deviceId",
          "latitude",
          "longitude",
          "label",
          "method",
          "disclosureApproved",
        ].includes(k),
    ) ||
    typeof body.organizationId !== "string" ||
    !UUID.test(body.organizationId) ||
    typeof body.deviceId !== "string" ||
    !UUID.test(body.deviceId) ||
    typeof body.latitude !== "number" ||
    !Number.isFinite(body.latitude) ||
    typeof body.longitude !== "number" ||
    !Number.isFinite(body.longitude) ||
    body.latitude < -12 ||
    body.latitude > 8 ||
    body.longitude < 94 ||
    body.longitude > 142 ||
    typeof body.label !== "string" ||
    body.label.trim().length < 3 ||
    body.label.trim().length > 120 ||
    !["field_gps", "manual_map_verified"].includes(String(body.method)) ||
    typeof body.disclosureApproved !== "boolean"
  )
    return reply({ error: "INVALID_REQUEST" }, 400);
  const access = await checkAdminAccess(body.organizationId, "manage_devices");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    const result = await db().query(
      `INSERT INTO listen_device_installations
        (device_id, organization_id, latitude, longitude, location_label,
         verification_method, disclosure_approved, verified_by_user_id)
       SELECT d.id, d.organization_id, $3, $4, $5, $6, $7, $8
       FROM ingestion_devices d
       WHERE d.id = $1 AND d.organization_id = $2 AND d.status = 'active'
       ON CONFLICT (device_id) DO UPDATE
       SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
         location_label=EXCLUDED.location_label,
         verification_method=EXCLUDED.verification_method,
         disclosure_approved=EXCLUDED.disclosure_approved,
         verified_by_user_id=EXCLUDED.verified_by_user_id,
         verified_at=now(), updated_at=now()
       RETURNING device_id`,
      [
        body.deviceId,
        body.organizationId,
        body.latitude,
        body.longitude,
        body.label.trim(),
        body.method,
        body.disclosureApproved,
        access.userId,
      ],
    );
    if (!result.rowCount) return reply({ error: "DEVICE_NOT_FOUND" }, 404);
    return reply({ status: "saved", deviceId: body.deviceId });
  } catch {
    return reply({ error: "INSTALLATION_SAVE_UNAVAILABLE" }, 503);
  }
}

/** Enumerates active LISTEN devices under the Admin's manage_devices capability. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const organizationId = params.get("organizationId");
  if (
    !organizationId ||
    !UUID.test(organizationId) ||
    params.size !== 1 ||
    params.getAll("organizationId").length !== 1
  ) {
    return reply({ error: "INVALID_REQUEST" }, 400);
  }
  const access = await checkAdminAccess(organizationId, "manage_devices");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    const result = await db().query<{
      id: string;
      code: string;
      label: string;
      location_label: string | null;
      latitude: number | null;
      longitude: number | null;
      verification_method: string | null;
      disclosure_approved: boolean | null;
    }>(
      `SELECT d.id,
              s.code,
              s.label,
              l.location_label,
              l.latitude,
              l.longitude,
              l.verification_method,
              l.disclosure_approved
         FROM ingestion_devices d
         JOIN observation_sources s
           ON s.id = d.source_id
          AND s.organization_id = d.organization_id
         LEFT JOIN listen_device_installations l
           ON l.device_id = d.id
          AND l.organization_id = d.organization_id
        WHERE d.organization_id = $1
          AND d.status = 'active'
          AND s.kind = 'listen_device'
        ORDER BY s.code
        LIMIT 100`,
      [organizationId],
    );
    return reply({
      devices: result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        label: row.label,
        locationLabel: row.location_label,
        latitude: row.latitude,
        longitude: row.longitude,
        verificationMethod: row.verification_method,
        disclosureApproved: row.disclosure_approved === true,
      })),
    });
  } catch {
    return reply({ error: "INSTALLATION_LIST_UNAVAILABLE" }, 503);
  }
}
